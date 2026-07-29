const SETTINGS_KEY = "kankan_settings";
const USER_KEY = "kankan_user";
const OPENAI_MODEL = "gpt-5.6-sol";
const PRODUCT_GOAL = "KanKan aims to provide a fast, polished WeChat mini program for document grammar review, tone rewriting, translation guidance, and professional terminology enhancement while preserving each user's saved preferences.";

const defaultSettings = {
  fileTypeIndex: 0,
  fileType: "自动识别",
  languageIndex: 0,
  translateIndex: 0,
  toneIndex: 1,
  genderIndex: 2,
  termIndex: 0,
  checks: {
    grammar: true,
    punctuation: true,
    sentence: true,
    structure: true,
    terminology: true,
  },
};

Page({
  data: {
    activeTab: "upload",
    userInfo: null,
    fileName: "",
    fileMeta: "",
    draftText: "",
    result: null,
    isReviewing: false,
    fileTypeOptions: ["自动识别", "PDF", "Word", "TXT", "RTF", "WPS", "PPT", "Excel", "CSV"],
    languageOptions: ["自动识别", "简体中文", "英文", "日文", "韩文", "法文", "西班牙文"],
    translateOptions: ["仅检查语法", "翻译成中文", "翻译成英文", "翻译成更正式表达", "翻译成更自然表达"],
    toneOptions: ["朋友", "同事", "长辈", "客户", "老师", "招聘方"],
    genderOptions: ["男性", "女性", "中性"],
    termOptions: ["通用", "经济", "学术", "专业", "简历", "商务", "法律"],
    checkOptions: [
      { key: "grammar", label: "语法纠错", desc: "检查错别字、病句和基础语法", checked: true },
      { key: "punctuation", label: "标题与符号", desc: "统一标题层级、标点和编号格式", checked: true },
      { key: "sentence", label: "句子长短", desc: "拆分过长句，补足表达不完整的短句", checked: true },
      { key: "structure", label: "语序结构", desc: "优化段落顺序和句内逻辑", checked: true },
      { key: "terminology", label: "术语增强", desc: "按所选行业补充更准确的专业词", checked: true },
    ],
    settings: defaultSettings,
  },

  onLoad() {
    const savedSettings = wx.getStorageSync(SETTINGS_KEY);
    const savedUser = wx.getStorageSync(USER_KEY);

    if (savedSettings) {
      const settings = this.normalizeSettings(savedSettings);
      this.setData({
        settings,
        checkOptions: this.syncCheckOptions(settings.checks),
      });
    }

    if (savedUser) {
      this.setData({ userInfo: savedUser });
    }

    this.checkLoginStatus();
  },

  normalizeSettings(settings) {
    const nextSettings = {
      ...defaultSettings,
      ...settings,
      checks: {
        ...defaultSettings.checks,
        ...(settings.checks || {}),
      },
    };
    nextSettings.fileType = this.data.fileTypeOptions[nextSettings.fileTypeIndex] || "自动识别";
    return nextSettings;
  },

  syncCheckOptions(checks) {
    return this.data.checkOptions.map((item) => ({
      ...item,
      checked: !!checks[item.key],
    }));
  },

  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.tab });
  },

  checkLoginStatus() {
    wx.checkSession({
      success: () => {
        const savedUser = wx.getStorageSync(USER_KEY);
        if (savedUser) {
          this.setData({ userInfo: savedUser });
          return;
        }
        this.promptLoginRequired();
      },
      fail: () => {
        this.promptLoginRequired();
      },
    });
  },

  promptLoginRequired() {
    wx.showModal({
      title: "需要登录",
      content: "登录后会保留你的语言、语气、术语和检查重点设置。",
      confirmText: "微信登录",
      cancelText: "稍后",
      success: (res) => {
        if (res.confirm) {
          this.handleLogin(false);
        }
      },
    });
  },

  handleLogin(showToast = true) {
    wx.login({
      success: (res) => {
        const user = {
          nickName: "KanKan 用户",
          code: res.code,
          loginAt: Date.now(),
        };

        wx.setStorageSync(USER_KEY, user);
        this.setData({ userInfo: user });

        if (showToast) {
          wx.showToast({ title: "登录状态已保存", icon: "success" });
        }
      },
      fail: () => {
        if (showToast) {
          wx.showToast({ title: "登录失败，请重试", icon: "none" });
        }
      },
    });
  },

  chooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["pdf", "doc", "docx", "txt", "rtf", "wps", "ppt", "pptx", "xls", "xlsx", "csv"],
      success: (res) => {
        const file = res.tempFiles[0];
        const size = file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "大小未知";
        const ext = this.getFileExt(file.name);

        this.setData({
          fileName: file.name,
          fileMeta: `${ext || "未知格式"} · ${size}`,
        });
      },
      fail: () => {
        wx.showToast({ title: "未选择文件", icon: "none" });
      },
    });
  },

  getFileExt(fileName) {
    const parts = (fileName || "").split(".");
    return parts.length > 1 ? parts.pop().toUpperCase() : "";
  },

  onDraftInput(event) {
    this.setData({ draftText: event.detail.value });
  },

  onFileTypeChange(event) {
    this.updateSettings({
      fileTypeIndex: Number(event.detail.value),
      fileType: this.data.fileTypeOptions[event.detail.value],
    });
  },

  onLanguageChange(event) {
    this.updateSettings({ languageIndex: Number(event.detail.value) });
  },

  onTranslateChange(event) {
    this.updateSettings({ translateIndex: Number(event.detail.value) });
  },

  selectTone(event) {
    this.updateSettings({ toneIndex: Number(event.currentTarget.dataset.index) });
  },

  selectGender(event) {
    this.updateSettings({ genderIndex: Number(event.currentTarget.dataset.index) });
  },

  selectTerm(event) {
    this.updateSettings({ termIndex: Number(event.currentTarget.dataset.index) });
  },

  toggleCheck(event) {
    const key = event.currentTarget.dataset.key;
    this.updateSettings({
      checks: {
        ...this.data.settings.checks,
        [key]: event.detail.value,
      },
    });
  },

  updateSettings(patch) {
    const settings = this.normalizeSettings({
      ...this.data.settings,
      ...patch,
    });
    this.setData({ settings });
    this.setData({ checkOptions: this.syncCheckOptions(settings.checks) });
    wx.setStorageSync(SETTINGS_KEY, settings);
  },

  saveSettings() {
    wx.setStorageSync(SETTINGS_KEY, this.data.settings);
    wx.showToast({ title: "设置已保存", icon: "success" });
    this.setData({ activeTab: "upload" });
  },

  async startReview() {
    if (!this.data.fileName && !this.data.draftText.trim()) {
      wx.showToast({ title: "请先上传或粘贴文本", icon: "none" });
      return;
    }

    this.setData({ isReviewing: true, result: null });

    try {
      const result = await this.callReviewApi();
      this.setData({ result });
      wx.showToast({ title: "检查完成", icon: "success" });
    } catch (error) {
      wx.showToast({ title: "接口未配置，已生成提示词", icon: "none" });
      this.setData({ result: this.buildLocalPromptPreview() });
    } finally {
      this.setData({ isReviewing: false });
    }
  },

  callReviewApi() {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: "reviewDocument",
        data: this.buildReviewPayload(),
        success: (res) => {
          if (!res.result || !res.result.ok) {
            reject(new Error((res.result && res.result.error) || "Review API failed"));
            return;
          }

          resolve(this.normalizeApiResult(res.result.data));
        },
        fail: reject,
      });
    });
  },

  buildReviewPayload() {
    const settings = this.data.settings;
    const enabledChecks = this.data.checkOptions
      .filter((item) => settings.checks[item.key])
      .map((item) => item.label);

    return {
      model: OPENAI_MODEL,
      file: {
        name: this.data.fileName,
        meta: this.data.fileMeta,
        type: this.data.fileTypeOptions[settings.fileTypeIndex],
      },
      text: this.data.draftText,
      preferences: {
        language: this.data.languageOptions[settings.languageIndex],
        translateMode: this.data.translateOptions[settings.translateIndex],
        toneTarget: this.data.toneOptions[settings.toneIndex],
        genderVoice: this.data.genderOptions[settings.genderIndex],
        terminology: this.data.termOptions[settings.termIndex],
        checks: enabledChecks,
      },
      prompt: this.buildReviewPrompt(enabledChecks),
    };
  },

  buildReviewPrompt(enabledChecks) {
    const settings = this.data.settings;
    return [
      "你是 KanKan 的文件语法检查与改写助手。",
      PRODUCT_GOAL,
      "请根据用户参数检查并改写文本，返回结构化结果：summary、issues、rewrittenText。",
      `目标语言：${this.data.languageOptions[settings.languageIndex]}`,
      `翻译/改写方向：${this.data.translateOptions[settings.translateIndex]}`,
      `语气对象：${this.data.toneOptions[settings.toneIndex]}`,
      `表达性别倾向：${this.data.genderOptions[settings.genderIndex]}`,
      `术语场景：${this.data.termOptions[settings.termIndex]}`,
      `检查重点：${enabledChecks.join("、")}`,
      "重点处理标题符号、标点、长短句、语序、语法错误和术语准确性。",
    ].join("\n");
  },

  normalizeApiResult(data) {
    if (Array.isArray(data && data.result)) {
      return data.result;
    }

    if (data && data.rewrittenText) {
      return [
        { title: "检查摘要", text: data.summary || "已完成语法检查与表达优化。" },
        { title: "修改建议", text: (data.issues || []).join("；") || "未返回具体问题列表。" },
        { title: "改写结果", text: data.rewrittenText },
      ];
    }

    return [
      { title: "接口返回", text: JSON.stringify(data || {}) },
    ];
  },

  buildLocalPromptPreview() {
    const payload = this.buildReviewPayload();
    return [
      {
        title: "OpenAI 接口待配置",
        text: "已预留 reviewDocument 云函数。配置 OPENAI_API_KEY 环境变量并上传云函数后，小程序会把参数和文本提交给 OpenAI 处理。",
      },
      {
        title: "当前模型",
        text: payload.model,
      },
      {
        title: "请求提示词",
        text: payload.prompt,
      },
    ];
  },
});
