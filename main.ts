import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
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

		// Daily Notes要約コマンドを追加
		this.addCommand({
			id: 'generate-daily-notes-summary',
			name: 'Generate daily notes summary',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.generateDailyNotesSummary(editor);
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

	private async generateDailyNotesSummary(editor: Editor) {
		if (!this.openai) {
			new Notice('OpenAI API Keyが設定されていません。設定タブで設定してください。');
			return;
		}

		try {
			new Notice('Daily Notes を読み込み中...');
			
			// 1週間分のDaily Notesを取得
			const dailyNotes = await this.getDailyNotesForLastWeek();
			
			if (dailyNotes.length === 0) {
				new Notice('過去1週間のDaily Notesが見つかりませんでした。Daily notesプラグインが有効になっているか、またはMy Agentの設定でDaily Notesのパスパターンを手動設定してください。');
				return;
			}

			new Notice('要約を生成中...');
			
			// OpenAI APIに送信する内容を準備
			const content = dailyNotes.map(note => 
				`# ${note.date}\n${note.content}`
			).join('\n\n');

			// OpenAI APIで要約生成
			const summary = await this.generateSummaryWithOpenAI(content);
			
			// カーソル位置に要約を挿入
			editor.replaceSelection(summary);
			
			new Notice('要約を生成しました！');
			
		} catch (error) {
			new Notice(`要約生成中にエラーが発生しました: ${error.message}`);
		}
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
			
			const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD形式
			const year = date.getFullYear().toString();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			
			// パスパターンを実際の日付に置換
			const dailyNotePath = pathPattern
				.replace('{date}', dateString)
				.replace('{year}', year)
				.replace('{month}', month)
				.replace('{day}', day);
			
			// Daily notesファイルを検索して読み込み
			const file = this.app.vault.getAbstractFileByPath(dailyNotePath);
			if (file instanceof TFile) {
				const content = await this.app.vault.read(file);
				if (content.trim()) {
					dailyNotes.push({
						date: dateString,
						content: content
					});
				}
			}
		}
		
		return dailyNotes.reverse(); // 古い日付から新しい日付の順にソート
	}

	private async generateSummaryWithOpenAI(content: string): Promise<string> {
		const response = await this.openai!.chat.completions.create({
			model: 'gpt-4',
			messages: [
				{
					role: 'system',
					content: `以下は1週間分のdaily notesです。内容を分析して、以下の形式で要約してください：

## 1週間中の重大な出来事

## 1週間中に達成したこと

## 1週間中に分かったこと

## 気付いた課題

## ネクストアクション

各セクションに該当する内容がない場合は「特になし」と記載してください。日本語で回答してください。見出しの次の行は必ず改行してください。`
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
			.setDesc('OpenAI APIキーを入力してください。ChatGPTでDaily Notesの要約を生成するために使用されます。')
			.addText(text => text
				.setPlaceholder('sk-...')
				.setValue(this.plugin.settings.openaiApiKey)
				.onChange(async (value) => {
					this.plugin.settings.openaiApiKey = value;
					await this.plugin.saveSettings();
				}));
		
		containerEl.createEl('p', {
			text: '使用方法: コマンドパレットから "Generate daily notes summary" を実行するか、エディタでコマンドを実行してください。',
			cls: 'setting-item-description'
		});
	}
}
