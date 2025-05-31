import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import OpenAI from 'openai';

interface MyAgentSettings {
	openaiApiKey: string;
}

const DEFAULT_SETTINGS: MyAgentSettings = {
	openaiApiKey: ''
}

export default class MyAgentPlugin extends Plugin {
	settings: MyAgentSettings;
	private openai: OpenAI | null = null;

	async onload() {
		await this.loadSettings();
		
		// OpenAI APIクライアントを初期化
		this.initializeOpenAI();

		this.addCommand({
			id: 'generate-weekly-note',
			name: 'Generate a weekly note',
			callback: () => {
				this.generateWeeklyNote();
			}
		});

		// 設定タブを追加
		this.addSettingTab(new MyAgentSettingTab(this.app, this));
	}

	onunload() {
		// クリーンアップは特になし
	}

	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.initializeOpenAI();
	}

	private initializeOpenAI() {
		if (this.settings.openaiApiKey && this.settings.openaiApiKey.trim() !== '') {
			this.openai = new OpenAI({
				apiKey: this.settings.openaiApiKey,
				dangerouslyAllowBrowser: true
			});
		} else {
			this.openai = null;
		}
	}

	private async generateWeeklyNote() {
		if (!this.openai) {
			new Notice('OpenAI API Keyが設定されていません。設定タブで設定してください。');
			return;
		}

		try {
			new Notice('Daily Notes を読み込み中...');
			
			// 1週間分のDaily Notesを取得
			const dailyNotes = await this.getDailyNotesForLastWeek();
			
			if (dailyNotes.length === 0) {
				new Notice('過去1週間のDaily Notesが見つかりませんでした。Daily notesプラグインが有効になっているか確認してください。');
				return;
			}

			new Notice('要約を生成中...');
			
			// OpenAI APIに送信する内容を準備
			const content = dailyNotes.map(note => 
				`# ${note.date}\n${note.content}`
			).join('\n\n');

			// OpenAI APIで要約生成
			const summary = await this.generateSummaryWithOpenAI(content);
			
			// Weekly Noteファイルを作成
			await this.createWeeklyNoteFile(summary);
			
			new Notice('Weekly Noteを生成しました！');
			
		} catch (error) {
			new Notice(`Weekly Note生成中にエラーが発生しました: ${error.message}`);
		}
	}

	private getPeriodicNotesSettings() {
		// Periodic Notesプラグインの設定を取得
		const periodicNotesPlugin = (this.app as any).plugins?.plugins?.['periodic-notes'];
		if (periodicNotesPlugin && periodicNotesPlugin.settings) {
			return periodicNotesPlugin.settings;
		}
		return null;
	}

	private async createWeeklyNoteFile(summary: string) {
		// Periodic Notesプラグインの設定を取得
		const periodicNotesSettings = this.getPeriodicNotesSettings();
		
		// 週番号とファイル名を生成
		const now = new Date();
		const weekNumber = this.getWeekNumber(now);
		const year = now.getFullYear();
		const fileName = `${year}-W${weekNumber.toString().padStart(2, '0')}`;
		
		// Periodic Notesの設定からフォルダを取得、なければデフォルトで Weekly フォルダを使用
		let weeklyFolder = '';
		if (periodicNotesSettings && periodicNotesSettings.weekly && periodicNotesSettings.weekly.folder) {
			weeklyFolder = periodicNotesSettings.weekly.folder;
		} else if (periodicNotesSettings && periodicNotesSettings.weekly && periodicNotesSettings.weekly.path) {
			weeklyFolder = periodicNotesSettings.weekly.path;
		} else {
			weeklyFolder = 'Weekly'; // デフォルトフォルダ
		}
		
		// ファイルパスを構築
		const filePath = weeklyFolder ? `${weeklyFolder}/${fileName}.md` : `${fileName}.md`;
		
		// フォルダが存在しない場合は作成
		if (weeklyFolder) {
			const folder = this.app.vault.getAbstractFileByPath(weeklyFolder);
			if (!folder) {
				await this.app.vault.createFolder(weeklyFolder);
			}
		}
		
		// ファイルが既に存在するかチェック
		const existingFile = this.app.vault.getAbstractFileByPath(filePath);
		if (existingFile instanceof TFile) {
			new Notice(`Weekly Note ${fileName} は既に存在します。`);
			return;
		}
		
		// Weekly Noteの内容を構築
		const weeklyNoteContent = `${summary}`;
		
		// ファイルを作成
		await this.app.vault.create(filePath, weeklyNoteContent);
	}

	private getWeekNumber(date: Date): number {
		// ISO 8601週番号を計算
		const d = new Date(date.getTime());
		d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
		const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
		const weekNumber = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
		return weekNumber;
	}

	private getDailyNotesSettings() {
		// Daily notesプラグインの設定を取得
		const dailyNotesPlugin = (this.app as any).plugins?.plugins?.['daily-notes'];
		if (dailyNotesPlugin && dailyNotesPlugin.settings) {
			return dailyNotesPlugin.settings;
		}

		// もしくは、Core Daily notesの設定を確認
		const corePlugins = (this.app as any).internalPlugins;
		const coreDailyNotes = corePlugins?.plugins?.['daily-notes'];
		if (coreDailyNotes && coreDailyNotes.instance?.options) {
			return coreDailyNotes.instance.options;
		}

		return null;
	}

	private async getDailyNotesForLastWeek(): Promise<Array<{date: string, content: string}>> {
		const dailyNotes: Array<{date: string, content: string}> = [];
		const today = new Date();
		
		// Daily notesプラグインの設定を取得
		const dailyNotesSettings = this.getDailyNotesSettings();
		
		if (!dailyNotesSettings) {
			new Notice('Daily notesプラグインの設定が見つかりません。Daily notesプラグインが有効になっているか確認してください。');
			return [];
		}

		// Daily notesプラグインの設定からパスを取得
		const folder = dailyNotesSettings.folder || '';
		const format = dailyNotesSettings.format || 'YYYY-MM-DD';
		
		// フォーマットをパスパターンに変換
		const dateFormat = format
			.replace('YYYY', '{year}')
			.replace('MM', '{month}')
			.replace('DD', '{day}')
			.replace('MMMM', '{monthName}')
			.replace('MMM', '{monthShort}');
		
		const pathPattern = folder ? `${folder}/${dateFormat}.md` : `${dateFormat}.md`;
		
		// 過去7日間の日付を生成
		for (let i = 0; i < 7; i++) {
			const date = new Date(today);
			date.setDate(today.getDate() - i);
			
			const year = date.getFullYear().toString();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			
			// パスパターンを実際の日付に置換
			const dailyNotePath = pathPattern
				.replace('{year}', year)
				.replace('{month}', month)
				.replace('{day}', day);
			
			// Daily notesファイルを検索して読み込み
			const file = this.app.vault.getAbstractFileByPath(dailyNotePath);
			if (file instanceof TFile) {
				const content = await this.app.vault.read(file);
				if (content.trim()) {
					// ファイル名から実際の日付を抽出
					const actualDate = this.extractDateFromFilePath(file.path, folder, format);
					
					dailyNotes.push({
						date: actualDate || `${year}-${month}-${day}`, // フォールバック
						content: content
					});
				}
			}
		}
		
		return dailyNotes.reverse(); // 古い日付から新しい日付の順にソート
	}

	private extractDateFromFilePath(filePath: string, folder: string, format: string): string | null {
		// ファイル名から拡張子を除去
		let fileName = filePath.replace(/\.md$/, '');
		
		// フォルダがある場合は除去
		if (folder) {
			fileName = fileName.replace(`${folder}/`, '');
		}
		
		// フォーマットに基づいて日付を抽出
		if (format === 'YYYY-MM-DD') {
			// YYYY-MM-DD形式の場合
			const match = fileName.match(/(\d{4}-\d{2}-\d{2})/);
			return match ? match[1] : null;
		}
		
		// 他のフォーマットの場合は簡単な変換
		// より複雑なフォーマットが必要な場合は拡張可能
		return fileName;
	}

	private async generateSummaryWithOpenAI(content: string): Promise<string> {
		const response = await this.openai!.chat.completions.create({
			model: 'gpt-4',
			messages: [
				{
					role: 'system',
					content: `1週間分のdaily notesを渡します。内容を分析して、以下の形式で要約してください:

## 1週間中の重大な出来事

## 1週間中に達成したこと

## 1週間中に分かったこと

## 気付いた課題

## ネクストアクション


- 各行の最後に、関連する日付への参照を [[2025-05-26]] のように記載してください。日付の参照と日付の参照の間にはスペースを入れてください。
- 各セクションに該当する内容がない場合は「特になし」と記載してください。
- 日本語で回答してください。
- 見出しの次は必ず改行のみの行としてください。`
				},
				{
					role: 'user',
					content: content
				}
			],
			max_tokens: 1000,
			temperature: 0.7,
		});

		return response.choices[0]?.message?.content || '要約を生成できませんでした。';
	}
}

class MyAgentSettingTab extends PluginSettingTab {
	plugin: MyAgentPlugin;

	constructor(app: App, plugin: MyAgentPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'My Agent Settings'});

		new Setting(containerEl)
			.setName('OpenAI API Key')
			.setDesc('OpenAI APIキーを入力してください。')
			.addText(text => text
				.setPlaceholder('sk-...')
				.setValue(this.plugin.settings.openaiApiKey)
				.onChange(async (value) => {
					this.plugin.settings.openaiApiKey = value;
					await this.plugin.saveSettings();
				}));
	}
}
