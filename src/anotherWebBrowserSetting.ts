import {
	App,
	DropdownComponent,
	Notice,
	Platform,
	PluginSettingTab,
	SearchComponent,
	setIcon,
	Setting
} from "obsidian";
import { t } from "./translations/helper";
import { clipboard } from "electron";
import AnotherWebBrowserPlugin from "./anotherWebBrowserIndex";

type settingSearchInfo = { containerEl: HTMLElement, name: string, description: string, options: SearchOptionInfo[], alias?: string }
type TabContentInfo = { content: HTMLElement, heading: HTMLElement, navButton: HTMLElement }
export type SearchOptionInfo = { name: string, description: string, options?: DropdownRecord[] }

export interface AnotherWebBrowserPluginSettings {
	defaultSearchEngine: string;
	customSearchUrl: SearchEngine[];
	showSearchBarInPage: boolean;
	customHighlightFormat: boolean;
	highlightFormat: string;
	openInSameTab: boolean;
	openInObsidianWeb: boolean;
}

interface SearchEngine {
	name: string;
	url: string;
	searchWith: boolean;
}

export const DEFAULT_SETTINGS: AnotherWebBrowserPluginSettings = {
	defaultSearchEngine: 'duckduckgo',
	customSearchUrl: [{
		name: 'duckduckgo',
		url: 'https://duckduckgo.com/?q=',
		searchWith: false,
	}],
	showSearchBarInPage: false,
	customHighlightFormat: false,
	highlightFormat: '[{CONTENT}]({URL})',
	openInSameTab: false,
	openInObsidianWeb: false,
}
// Add search engines here for the future used.
export const SEARCH_ENGINES = {
	'google': 'https://www.google.com/search?q=',
	'bing': 'https://www.bing.com/search?q=',
	'duckduckgo': 'https://duckduckgo.com/?q=',
	'yahoo': 'https://search.yahoo.com/search?p=',
	'baidu': 'https://www.baidu.com/s?wd=',
	'wikipedia': 'https://en.wikipedia.org/w/index.php?search=',
};

const tabNameToTabIconId: Record<string, string> = {
	General: 'chrome',
	Search: 'search',
};

export class DropdownRecord {
	public value: string;
	public description: string;

	constructor(value: string, description: string) {
		this.value = value;
		this.description = description;
	}
}

export class WebBrowserSettingTab extends PluginSettingTab {
	plugin: AnotherWebBrowserPlugin;
	private applyDebounceTimer = 0;
	private tabContent: Map<string, TabContentInfo> = new Map<string, TabContentInfo>();
	private selectedTab: string = 'General';
	private search: SearchComponent;
	private searchSettingInfo: Map<string, settingSearchInfo[]> = new Map();
	private searchZeroState: HTMLDivElement;
	private navEl: HTMLElement;

	constructor(app: App, plugin: AnotherWebBrowserPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	applySettingsUpdate() {
		clearTimeout(this.applyDebounceTimer);
		const plugin = this.plugin;
		this.applyDebounceTimer = window.setTimeout(() => {
			plugin.saveSettings();
		}, 100);
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();


		this.generateSettingsTitle();
		this.addTabHeader();
	}

	private generateSettingsTitle() {
		const linterHeader = this.containerEl.createDiv('wb-setting-title');
		linterHeader.createEl('h2', { text: 'Web Browser' });
		this.generateSearchBar(linterHeader);
	}

	private addTabHeader() {
		const navContainer = this.containerEl.createEl('nav', { cls: 'wb-setting-header' });
		this.navEl = navContainer.createDiv('wb-setting-tab-group');
		const settingsEl = this.containerEl.createDiv('wb-setting-content');

		this.createTabAndContent('General', this.navEl, settingsEl, (el: HTMLElement, tabName: string) => this.generateGeneralSettings(tabName, el));
		this.createTabAndContent('Search', this.navEl, settingsEl, (el: HTMLElement, tabName: string) => this.generateSearchSettings(tabName, el));

		this.createSearchZeroState(settingsEl);
	}

	generateSearchBar(containerEl: HTMLElement) {
		// based on https://github.com/valentine195/obsidian-settings-search/blob/master/src/main.ts#L294-L308
		const searchSetting = new Setting(containerEl);
		searchSetting.settingEl.style.border = 'none';
		searchSetting.addSearch((s: SearchComponent) => {
			this.search = s;
		});

		this.search.setPlaceholder(t('Search all settings'));

		this.search.inputEl.onfocus = () => {
			for (const tabInfo of this.tabContent) {
				const tab = tabInfo[1];
				tab.navButton.removeClass('wb-navigation-item-selected');
				(tab.content as HTMLElement).show();
				(tab.heading as HTMLElement).show();

				const searchVal = this.search.getValue();
				if (this.selectedTab == '' && searchVal.trim() != '') {
					this.searchSettings(searchVal.toLowerCase());
				}

				this.selectedTab = '';
			}
			this.navEl.addClass('wb-setting-searching');
		};

		this.search.inputEl.onblur = () => {
			this.navEl.removeClass('wb-setting-searching');
		}

		this.search.onChange((value: string) => {
			this.searchSettings(value.toLowerCase());
		});
	}

	createTabAndContent(tabName: string, navEl: HTMLElement, containerEl: HTMLElement, generateTabContent?: (el: HTMLElement, tabName: string) => void) {
		const displayTabContent = this.selectedTab === tabName;
		const tabEl = navEl.createDiv('wb-navigation-item');

		const tabClass = 'wb-desktop';
		tabEl.addClass(tabClass);

		setIcon(tabEl.createEl("div", { cls: 'wb-navigation-item-icon' }), tabNameToTabIconId[tabName], 20);
		// @ts-ignore
		tabEl.createSpan().setText(t(tabName));

		tabEl.onclick = () => {
			if (this.selectedTab == tabName) {
				return;
			}

			tabEl.addClass('wb-navigation-item-selected');
			const tab = this.tabContent.get(tabName);
			(tab?.content as HTMLElement).show();

			if (this.selectedTab != '') {
				const tabInfo = this.tabContent.get(this.selectedTab);
				tabInfo?.navButton.removeClass('wb-navigation-item-selected');
				(tabInfo?.content as HTMLElement).hide();
			} else {
				(this.searchZeroState as HTMLElement).hide();


				for (const settingTab of this.searchSettingInfo) {
					for (const setting of settingTab[1]) {
						(setting.containerEl as HTMLElement).show();
					}
				}

				for (const tabInfo of this.tabContent) {
					const tab = tabInfo[1];
					(tab.heading as HTMLElement).hide();
					if (tabName !== tabInfo[0]) {
						(tab.content as HTMLElement).hide();
					}
				}
			}

			this.selectedTab = tabName;
		};

		const tabContent = containerEl.createDiv('wb-tab-settings');

		const tabHeader = tabContent.createEl('h2', { cls: "wb-setting-heading", text: tabName + ' Settings' });
		(tabHeader as HTMLElement).hide();

		tabContent.id = tabName.toLowerCase().replace(' ', '-');
		if (!displayTabContent) {
			(tabContent as HTMLElement).hide();
		} else {
			tabEl.addClass('wb-navigation-item-selected');
		}

		if (generateTabContent) {
			generateTabContent(tabContent, tabName);
		}

		this.tabContent.set(tabName, { content: tabContent, heading: tabHeader, navButton: tabEl });
	}

	private searchSettings(searchVal: string) {
		const tabsWithSettingsInSearchResults = new Set<string>();
		const that = this;
		const showSearchResultAndAddTabToResultList = function (settingContainer: HTMLElement, tabName: string) {
			(settingContainer as HTMLElement).show();

			if (!tabsWithSettingsInSearchResults.has(tabName)) {
				tabsWithSettingsInSearchResults.add(tabName);
			}
		};

		for (const tabSettingInfo of this.searchSettingInfo) {
			const tabName = tabSettingInfo[0];
			const tabSettings = tabSettingInfo[1];
			for (const settingInfo of tabSettings) {
				// check the more common things first and then make sure to search the options since it will be slower to do that
				// Note: we check for an empty string for searchVal to see if the search is essentially empty which will display all rules
				if (searchVal.trim() === '' || settingInfo.alias?.includes(searchVal) || settingInfo.description.includes(searchVal) || settingInfo.name.includes(searchVal)) {
					showSearchResultAndAddTabToResultList(settingInfo.containerEl, tabName);
				} else if (settingInfo.options) {
					for (const optionInfo of settingInfo.options) {
						if (optionInfo.description.toLowerCase().includes(searchVal) || optionInfo.name.toLowerCase().includes(searchVal)) {
							showSearchResultAndAddTabToResultList(settingInfo.containerEl, tabName);

							break;
						} else if (optionInfo.options) {
							for (const optionsForOption of optionInfo.options) {
								if (optionsForOption.description.toLowerCase().includes(searchVal) || optionsForOption.value.toLowerCase().includes(searchVal)) {
									showSearchResultAndAddTabToResultList(settingInfo.containerEl, tabName);

									break;
								}
							}
						}

						(settingInfo.containerEl as HTMLElement).hide();
					}
				} else {
					(settingInfo.containerEl as HTMLElement).hide();
				}
			}
		}

		// display any headings that have setting results and hide any that do not
		for (const tabInfo of this.tabContent) {
			if (tabsWithSettingsInSearchResults.has(tabInfo[0])) {
				(tabInfo[1].heading as HTMLElement).show();
			} else {
				(tabInfo[1].heading as HTMLElement).hide();
			}
		}

		if (tabsWithSettingsInSearchResults.size === 0) {
			(this.searchZeroState as HTMLElement).show();
		} else {
			(this.searchZeroState as HTMLElement).hide();
		}
	}

	private generateGeneralSettings(tabName: string, wbContainerEl: HTMLElement) {
		this.addInpageSearch(tabName, wbContainerEl);
		this.addOpenInSameTab(tabName, wbContainerEl);
		this.addOpenInObsidianWeb(tabName, wbContainerEl);
	}

	private generateSearchSettings(tabName: string, wbContainerEl: HTMLElement): void {
		this.addHighlightFormat(tabName, wbContainerEl);
		this.addSearchEngine(tabName, wbContainerEl);
	}

	// @ts-ignore
	private addSettingToMasterSettingsList(tabName: string, containerEl: HTMLElement, name: string = '', description: string = '', options: SearchOptionInfo[] = null, alias: string = null) {
		const settingInfo = {
			containerEl: containerEl,
			name: name.toLowerCase(),
			description: description.toLowerCase(),
			options: options,
			alias: alias
		};

		if (!this.searchSettingInfo.has(tabName)) {
			this.searchSettingInfo.set(tabName, [settingInfo]);
		} else {
			this.searchSettingInfo.get(tabName)?.push(settingInfo);
		}
	}

	private createSearchZeroState(containerEl: HTMLElement) {
		this.searchZeroState = containerEl.createDiv();
		(this.searchZeroState as HTMLElement).hide();
		this.searchZeroState.createEl(Platform.isMobile ? 'h3' : 'h2', { text: 'No settings match search' }).style.textAlign = 'center';
	}

	private addInpageSearch(tabName: string, wbContainerEl: HTMLElement) {
		let settingName = t('Show Search Bar In Empty Page');
		let setting = new Setting(wbContainerEl)
			.setName(settingName)
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.showSearchBarInPage)
					.onChange(async (value) => {
						this.plugin.settings.showSearchBarInPage = value;
						this.applySettingsUpdate();
						this.display();
					})
			})

		this.addSettingToMasterSettingsList(tabName, setting.settingEl, settingName);
	}

	private addSearchEngine(tabName: string, wbContainerEl: HTMLElement) {
		let settingName = t('Default Search Engine');
		let setting = new Setting(wbContainerEl)
			.setName(settingName)
			.addDropdown(async (drowdown: DropdownComponent) => {
				drowdown
					.addOption('duckduckgo', t('DuckDuckGo'))
					.addOption('google', t('Google'))
					.addOption('bing', t('Bing'))
					.addOption('yahoo', t('Yahoo'))
					.addOption('baidu', t('Baidu'))
					.addOption('custom', t('Custom'))
					.setValue(this.plugin.settings.defaultSearchEngine).onChange(async (value) => {
					this.plugin.settings.defaultSearchEngine = value;
					this.applySettingsUpdate();
					// Force refresh
					this.display();
				});
			});

		this.addSettingToMasterSettingsList(tabName, setting.settingEl, settingName);

		if (!(this.plugin.settings.defaultSearchEngine === 'custom')) {
			return;
		}

		if (typeof this.plugin.settings.customSearchUrl !== "object") {
			this.plugin.settings.customSearchUrl = DEFAULT_SETTINGS.customSearchUrl;
		}

		settingName = t('Add new custom search engine');
		setting = new Setting(wbContainerEl)
			.setName(settingName)
			.addButton((button) => button
				.setButtonText('+')
				.onClick(async () => {
					this.plugin.settings.customSearchUrl.push({
						name: `Custom Search ${ this.plugin.settings.customSearchUrl.length + 1 }`,
						url: 'https://www.google.com/search?q=',
						searchWith: false,
					});
					await this.plugin.saveSettings();
					this.display();
				}));

		this.addSettingToMasterSettingsList(tabName, setting.settingEl, settingName);

		this.plugin.settings.customSearchUrl.forEach((searchEngine, index) => {
			settingName = searchEngine.name ? searchEngine.name : t('Custom Search') + `${ this.plugin.settings.customSearchUrl.length > 1 ? ` ${ index + 1 }` : '' }`;
			const topLevelSetting = new Setting(wbContainerEl)
				.setClass('search-engine-setting')
				.setName(settingName)
				.addButton((button) => button
					.setButtonText(t('Delete Custom Search'))
					.onClick(async () => {
						this.plugin.settings.customSearchUrl.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					}));

			const mainSettingsEl = topLevelSetting.settingEl.createEl('div', 'search-engine-main-settings');

			const mainSettingsNameEl = mainSettingsEl.createEl('div', 'search-engine-main-settings-name');
			const mainSettingsUrlEl = mainSettingsEl.createEl('div', 'search-engine-main-settings-url');

			mainSettingsNameEl.createEl('label', { text: t('Name') });
			mainSettingsNameEl.createEl('input', {
				cls: 'search-engine-name-input',
				type: 'text',
				value: searchEngine.name,
			}).on('change', '.search-engine-name-input', async (evt: Event) => {
				const target = evt.target as HTMLInputElement;
				this.plugin.settings.customSearchUrl[index] = { ...searchEngine, name: target.value };
				await this.plugin.saveSettings();
			});

			mainSettingsUrlEl.createEl('label', { text: t('Url') });
			mainSettingsUrlEl.createEl('input', {
				cls: 'search-engine-url-input',
				type: 'text',
				value: searchEngine.url,
			}).on('change', '.search-engine-url-input', async (evt: Event) => {
				const target = evt.target as HTMLInputElement;
				this.plugin.settings.customSearchUrl[index] = { ...searchEngine, url: target.value };
				await this.plugin.saveSettings();
			});

			this.addSettingToMasterSettingsList(tabName, topLevelSetting.settingEl, settingName);
		});
	}

	private addHighlightFormat(tabName: string, wbContainerEl: HTMLElement) {
		let settingName = t('Custom Link to Highlight Format');
		let setting = new Setting(wbContainerEl)
			.setName(settingName)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.customHighlightFormat)
					.onChange(async (value) => {
						this.plugin.settings.customHighlightFormat = value;
						this.applySettingsUpdate();
						// Force refresh
						this.display();
					});
			})

		this.addSettingToMasterSettingsList(tabName, setting.settingEl, settingName);

		if (!this.plugin.settings.customHighlightFormat) {
			return;
		}

		settingName = t('Copy Link to Highlight Format');
		let settingDesc = t("Set copy link to text fragment format. [{CONTENT}]({URL}) By default. You can also set {TIME:YYYY-MM-DD HH:mm:ss} to get the current date.");
		setting = new Setting(wbContainerEl)
			.setName(settingName)
			.setDesc(settingDesc)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.highlightFormat)
					.setValue(this.plugin.settings.highlightFormat)
					.onChange(async (value) => {
						if (value === "") {
							this.plugin.settings.highlightFormat = DEFAULT_SETTINGS.highlightFormat;
							this.applySettingsUpdate();
							// Force refresh
							this.display();
						}
						this.plugin.settings.highlightFormat = value;
						this.applySettingsUpdate();
					}),
			);

		this.addSettingToMasterSettingsList(tabName, setting.settingEl, settingName, settingDesc);
	}

	private addOpenInSameTab(tabName: string, wbContainerEl: HTMLElement) {
		let settingName = t('Open URL In Same Tab');
		let setting = new Setting(wbContainerEl)
			.setName(settingName)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.openInSameTab)
					.onChange(async (value) => {
						this.plugin.settings.openInSameTab = value;
						this.applySettingsUpdate();
						this.display();
					});
			});

		this.addSettingToMasterSettingsList(tabName, setting.settingEl, settingName);
	}

	private addOpenInObsidianWeb(tabName: string, wbContainerEl: HTMLElement) {
		let settingName = t('Open URL In Obsidian Web From Other Software');
		let setting = new Setting(wbContainerEl)
			.setName(settingName)
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.openInObsidianWeb)
					.onChange(async (value) => {
						this.plugin.settings.openInObsidianWeb = value;
						this.applySettingsUpdate();
						this.display();
					})
			})

		this.addSettingToMasterSettingsList(tabName, setting.settingEl, settingName);

		if (!this.plugin.settings.openInObsidianWeb) {
			return;
		}

		const bookmarkLetsContainerEl = wbContainerEl.createDiv({ cls: 'bookmarklets-container' });
		const bookmarkLetsBtn = bookmarkLetsContainerEl.createEl('button', {
			cls: "wb-btn"
		});

		bookmarkLetsBtn.createEl("a", {
			text: `Obsidian BookmarkLets Code`,
			cls: 'cm-url',
			href: 'javascript:(function(){var%20i%20%3Ddocument.location.href%3B%20document.location.href%3D%22obsidian%3A%2F%2Fweb-open%3Furl%3D%22%20%2B%20encodeURIComponent%28i%29%3B})();'
		})
		bookmarkLetsBtn.addEventListener("click", () => {
			clipboard.writeText(`javascript:(function(){var%20i%20%3Ddocument.location.href%3B%20document.location.href%3D%22obsidian%3A%2F%2Fweb-open%3Furl%3D%22%20%2B%20encodeURIComponent%28i%29%3B})();`)
			new Notice(t("Copy BookmarkLets Success"))
		})
		bookmarkLetsContainerEl.createEl("span", {
			cls: "wb-btn-tip",
			text: t("   <- Drag or click on me")
		})

		this.addSettingToMasterSettingsList(tabName, bookmarkLetsContainerEl, settingName);
	}
}
