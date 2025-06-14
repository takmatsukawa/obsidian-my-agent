import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import OpenAI from 'openai';

interface MyAgentSettings {
	openaiApiKey: string;
	ignoreFilePatterns: string[];
}

const DEFAULT_SETTINGS: MyAgentSettings = {
	openaiApiKey: '',
	ignoreFilePatterns: []
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
			new Notice('OpenAI API Key is not configured. Please set it in the settings tab.');
			return;
		}

		try {
			new Notice('Loading Daily Notes...');
			
			// 1週間分のDaily Notesを取得
			const dailyNotes = await this.getDailyNotesForLastWeek();
			
			if (dailyNotes.length === 0) {
				new Notice('No Daily Notes found for the past week. Please check if the Daily Notes plugin is enabled and configured.');
				return;
			}

			new Notice('Searching for updated files...');
			
			// 過去1週間に更新されたファイルを取得
			const updatedFiles = await this.getUpdatedFilesForLastWeek();

			new Notice('Generating summary...');
			
			// OpenAI APIに送信する内容を準備
			const content = dailyNotes.map(note => 
				`# ${note.date}\n${note.content}`
			).join('\n\n');

			// OpenAI APIで要約生成
			const summary = await this.generateSummaryWithOpenAI(content);
			
			// Weekly Noteファイルを作成（要約と更新されたファイルリストを含む）
			await this.createWeeklyNoteFile(summary, updatedFiles);
			
		} catch (error) {
			new Notice(`Error occurred while generating Weekly Note: ${error.message}`);
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

	private async createWeeklyNoteFile(summary: string, updatedFiles: Array<{path: string, name: string, modifiedDate: string}>) {
		const periodicNotesSettings = this.getPeriodicNotesSettings();
		
		const now = new Date();
		const weekNumber = this.getWeekNumber(now);
		const year = now.getFullYear();
		
		// ファイル名を生成（Format設定を参照）
		let fileName: string;
		if (periodicNotesSettings && periodicNotesSettings.weekly && periodicNotesSettings.weekly.format) {
			fileName = this.formatWeeklyNoteName(periodicNotesSettings.weekly.format, now, weekNumber, year);
		} else {
			// デフォルトフォーマット
			fileName = `${year}-W${weekNumber.toString().padStart(2, '0')}`;
		}
		
		// Periodic Notesの設定からフォルダを取得、なければデフォルトで Weekly フォルダを使用
		let weeklyFolder = '';
		if (periodicNotesSettings && periodicNotesSettings.weekly && periodicNotesSettings.weekly.folder) {
			weeklyFolder = periodicNotesSettings.weekly.folder;
		} else if (periodicNotesSettings && periodicNotesSettings.weekly && periodicNotesSettings.weekly.path) {
			weeklyFolder = periodicNotesSettings.weekly.path;
		} else {
			weeklyFolder = 'Weekly'; // デフォルトフォルダ
		}
		
		const filePath = weeklyFolder ? `${weeklyFolder}/${fileName}.md` : `${fileName}.md`;
		
		if (weeklyFolder) {
			const folder = this.app.vault.getAbstractFileByPath(weeklyFolder);
			if (!folder) {
				await this.app.vault.createFolder(weeklyFolder);
			}
		}
		
		// 更新されたファイルのリストを生成
		let updatedFilesSection = '';
		if (updatedFiles.length > 0) {
			updatedFilesSection = '\n\n## Files Updated This Week\n\n';
			updatedFiles.forEach(file => {
				updatedFilesSection += `- [[${file.name}]] (${file.modifiedDate})\n`;
			});
		} else {
			updatedFilesSection = '\n\n## Files Updated This Week\n\nNone\n';
		}
		
		const weeklyNoteContent = `${summary}${updatedFilesSection}`;
		
		// ファイルが既に存在するかチェックして、存在する場合は上書き、存在しない場合は新規作成
		const existingFile = this.app.vault.getAbstractFileByPath(filePath);
		if (existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, weeklyNoteContent);
			new Notice(`Weekly Note ${fileName} updated!`);
		} else {
			await this.app.vault.create(filePath, weeklyNoteContent);
			new Notice(`Weekly Note ${fileName} created!`);
		}
	}

	private formatWeeklyNoteName(format: string, date: Date, weekNumber: number, year: number): string {
		// Periodic Notesのフォーマット文字列を解析して実際の値に置換
		let result = format;
		
		// リテラル文字列（[]で囲まれた部分）を一時的に保護
		const literals: string[] = [];
		result = result.replace(/\[([^\]]+)\]/g, (match, content) => {
			literals.push(content);
			return `__LITERAL_${literals.length - 1}__`;
		});
		
		// フォーマット文字列を置換
		result = result
			.replace(/YYYY/g, year.toString())
			.replace(/YY/g, year.toString().slice(-2))
			.replace(/WW/g, weekNumber.toString().padStart(2, '0'))
			.replace(/W/g, weekNumber.toString());
		
		// リテラル文字列を復元
		literals.forEach((literal, index) => {
			result = result.replace(`__LITERAL_${index}__`, literal);
		});
		
		return result;
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
			new Notice('Daily Notes plugin settings not found. Please check if the Daily Notes plugin is enabled and configured.');
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

	private async getUpdatedFilesForLastWeek(): Promise<Array<{path: string, name: string, modifiedDate: string}>> {
		const updatedFiles: Array<{path: string, name: string, modifiedDate: string}> = [];
		const oneWeekAgo = new Date();
		oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
		
		// Vaultの全ファイルを取得
		const allFiles = this.app.vault.getMarkdownFiles();
		
		for (const file of allFiles) {
			// ファイルの最終更新日時を取得
			const stat = await this.app.vault.adapter.stat(file.path);
			if (stat && stat.mtime > oneWeekAgo.getTime()) {
				// Daily Notesフォルダのファイルは除外（Daily Notesは別途処理済み）
				const dailyNotesSettings = this.getDailyNotesSettings();
				const dailyNotesFolder = dailyNotesSettings?.folder || '';
				
				// Weekly Notesフォルダのファイルも除外
				const periodicNotesSettings = this.getPeriodicNotesSettings();
				let weeklyFolder = '';
				if (periodicNotesSettings && periodicNotesSettings.weekly && periodicNotesSettings.weekly.folder) {
					weeklyFolder = periodicNotesSettings.weekly.folder;
				} else if (periodicNotesSettings && periodicNotesSettings.weekly && periodicNotesSettings.weekly.path) {
					weeklyFolder = periodicNotesSettings.weekly.path;
				} else {
					weeklyFolder = 'Weekly';
				}
				
				// Daily NotesフォルダとWeekly Notesフォルダのファイルを除外
				const shouldExclude = (dailyNotesFolder && file.path.startsWith(dailyNotesFolder + '/')) ||
									 (weeklyFolder && file.path.startsWith(weeklyFolder + '/'));
				
				// 無視ファイルパターンをチェック
				const shouldIgnore = this.shouldIgnoreFile(file.path);
				
				if (!shouldExclude && !shouldIgnore) {
					const modifiedDate = new Date(stat.mtime).toLocaleDateString('ja-JP');
					const fileName = file.basename; // 拡張子なしのファイル名
					
					updatedFiles.push({
						path: file.path,
						name: fileName,
						modifiedDate: modifiedDate
					});
				}
			}
		}
		
		// 更新日時でソート（新しい順）
		updatedFiles.sort((a, b) => {
			const dateA = new Date(a.modifiedDate).getTime();
			const dateB = new Date(b.modifiedDate).getTime();
			return dateB - dateA;
		});
		
		return updatedFiles;
	}

	private shouldIgnoreFile(filePath: string): boolean {
		// 設定で指定された無視パターンをチェック
		for (const pattern of this.settings.ignoreFilePatterns) {
			if (this.matchesPattern(filePath, pattern)) {
				return true;
			}
		}
		return false;
	}

	private matchesPattern(filePath: string, pattern: string): boolean {
		// シンプルなglobパターンマッチング
		// ** は任意の深さのディレクトリ、* は任意の文字列
		const regexPattern = pattern
			.replace(/\*\*/g, '.*')  // ** を .* に変換
			.replace(/\*/g, '[^/]*') // * を [^/]* に変換（スラッシュ以外の任意の文字）
			.replace(/\./g, '\\.');  // . をエスケープ
		
		const regex = new RegExp(`^${regexPattern}$`);
		return regex.test(filePath);
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
			.setDesc('Enter your OpenAI API key.')
			.addText(text => text
				.setPlaceholder('sk-...')
				.setValue(this.plugin.settings.openaiApiKey)
				.onChange(async (value) => {
					this.plugin.settings.openaiApiKey = value;
					await this.plugin.saveSettings();
				}));

		// 無視ファイルパターンの設定
		containerEl.createEl('h3', {text: 'Ignore File Patterns'});
		containerEl.createEl('p', {
			text: 'Specify file patterns to ignore when generating Weekly Notes. Glob patterns (*, **) are supported.',
			cls: 'setting-item-description'
		});

		// 既存のパターンを表示・編集
		this.plugin.settings.ignoreFilePatterns.forEach((pattern, index) => {
			new Setting(containerEl)
				.setName(`Pattern ${index + 1}`)
				.addText(text => text
					.setPlaceholder('e.g., .obsidian/**')
					.setValue(pattern)
					.onChange(async (value) => {
						this.plugin.settings.ignoreFilePatterns[index] = value;
						await this.plugin.saveSettings();
					}))
				.addButton(button => button
					.setButtonText('Delete')
					.setClass('mod-warning')
					.onClick(async () => {
						this.plugin.settings.ignoreFilePatterns.splice(index, 1);
						await this.plugin.saveSettings();
						this.display(); // 設定画面を再描画
					}));
		});

		// 新しいパターンを追加するボタン
		new Setting(containerEl)
			.setName('Add New Pattern')
			.addButton(button => button
				.setButtonText('Add')
				.setClass('mod-cta')
				.onClick(async () => {
					this.plugin.settings.ignoreFilePatterns.push('');
					await this.plugin.saveSettings();
					this.display(); // 設定画面を再描画
				}));
	}
}
