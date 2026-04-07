// ==UserScript==
// @name         知乎优化助手 (重定向 + 屏蔽热搜广告 + 自定义搜索)
// @namespace    https://github.com/yourusername
// @version      0.0.1
// @description  模块化整合：1. 重定向首页/热榜到搜索页 2. 彻底屏蔽知乎原生搜索框及热搜广告 3. 按“/”键唤出优雅的自定义搜索框
// @author       You & Assistant
// @match        *://*.zhihu.com/*
// @icon         https://www.zhihu.com/favicon.ico
// @grant        GM_addStyle
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    /* =========================================================================
     * [配置中心] 集中管理选择器、样式和基础配置，方便后续拓展
     * ========================================================================= */
    const CONFIG = {
        // 需要重定向的路径列表
        redirectPaths: ['/', '/hot'],
        // 目标重定向地址
        targetSearchUrl: 'https://www.zhihu.com/search',

        // 需要通过 CSS 隐藏的元素选择器 (原生搜索框 + 热搜广告)
        hideCssSelectors: [
            // 原生搜索框相关
            '.SearchBar-tool', '.SearchBar', '.TopSearchBar', '.AppHeader-search',
            'form[class*="SearchBar"]', 'div[class*="SearchBar"]:has(input[placeholder*="搜索"])',
            '.Button.SearchBar-searchButton', '.TopSearchBar-input',
            'header [class*="Search"]',
            // 热搜广告卡片相关
            '.HotSearchCard', '.Card.HotSearch'
        ],

        // 需要通过 DOM 移除的动态元素选择器 (热搜卡片、推荐)
        removeDomSelectors: [
            '.HotSearchCard',
            '.Card.HotSearch',
            '.HotSearch-recommend',
            '.HotSearch-related'
        ]
    };

    /* =========================================================================
     * [模块 1] Router - 路由拦截与重定向
     * ========================================================================= */
    const Router = {
        init() {
            const path = window.location.pathname;
            // 匹配首页、热榜或热榜子路径
            const shouldRedirect = CONFIG.redirectPaths.includes(path) || path.startsWith('/hot/');

            if (shouldRedirect) {
                window.location.replace(CONFIG.targetSearchUrl);
                return true; // 返回 true 表示已重定向，中断后续操作
            }
            return false;
        }
    };

    /* =========================================================================
     * [模块 2] Blocker - 广告与原生元素屏蔽器 (CSS + DOM Observer)
     * ========================================================================= */
    const Blocker = {
        // 注入全局 CSS 隐藏元素 (执行速度最快，无闪烁)
        injectCSS() {
            if (CONFIG.hideCssSelectors.length > 0) {
                const cssString = `${CONFIG.hideCssSelectors.join(',\n')} { display: none !important; }`;
                GM_addStyle(cssString);
            }
        },

        // 移除 DOM 节点 (针对某些可能通过脚本强行显示的顽固元素)
        removeElements() {
            const elements = document.querySelectorAll(CONFIG.removeDomSelectors.join(', '));
            elements.forEach(el => el.remove());
        },

        // 使用 MutationObserver 监听动态加载的内容
        initObserver() {
            this.removeElements(); // 初始化先执行一次

            const observer = new MutationObserver((mutations) => {
                let shouldClean = false;
                for (let mutation of mutations) {
                    if (mutation.addedNodes.length) {
                        shouldClean = true;
                        break;
                    }
                }
                if (shouldClean) {
                    this.removeElements();
                }
            });

            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });
        },

        init() {
            this.injectCSS();
            // DOM 准备好后再启动 Observer
            document.addEventListener('DOMContentLoaded', () => this.initObserver());
        }
    };

    /* =========================================================================
     * [模块 3] CustomSearch - 自定义搜索 UI 与交互逻辑
     * ========================================================================= */
    const CustomSearch = {
        elements: {}, // 存储 DOM 引用

        // 构建搜索浮层 UI
        buildUI() {
            // 1. 遮罩层
            const overlay = document.createElement('div');
            overlay.id = 'zh-custom-search-overlay';
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background-color: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px);
                z-index: 2147483647; display: none; align-items: center; justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            `;

            // 动画样式
            GM_addStyle(`
                @keyframes zhSearchFadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `);

            // 2. 搜索卡片
            const card = document.createElement('div');
            card.style.cssText = `
                background: #fff; border-radius: 20px; width: 90%; max-width: 560px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); overflow: hidden;
                animation: zhSearchFadeInUp 0.2s ease-out;
            `;

            // HTML 结构拼装
            card.innerHTML = `
                <div style="padding: 18px 24px 0; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 18px; font-weight: 600; color: #1e1e2f;">🔍 知乎搜索</span>
                    <button id="zh-search-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #8e8e9e; width: 32px; height: 32px; border-radius: 50%; transition: background 0.2s;">✕</button>
                </div>
                <div style="padding: 16px 24px 24px;">
                    <div style="display: flex; gap: 12px; align-items: center; background: #f5f6f7; border-radius: 48px; padding: 4px 4px 4px 20px;">
                        <input id="zh-search-input" type="text" placeholder="搜索问题、回答、文章…" autocomplete="off" style="flex: 1; border: none; background: transparent; font-size: 16px; padding: 12px 0; outline: none; color: #1a1a2e;">
                        <button id="zh-search-submit" style="background: #0066ff; border: none; color: white; font-weight: 500; font-size: 14px; padding: 8px 20px; border-radius: 40px; cursor: pointer; transition: background 0.2s;">搜索</button>
                    </div>
                    <div style="margin-top: 16px; font-size: 12px; color: #8e8e9e; text-align: center;">↵ 回车搜索 &nbsp;&nbsp;|&nbsp;&nbsp; ⎋ ESC 关闭</div>
                </div>
            `;
            overlay.appendChild(card);
            document.body.appendChild(overlay);

            // 3. 右下角悬浮按钮
            const floatBtn = document.createElement('div');
            floatBtn.innerHTML = `
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill="white"/>
                    <text x="18" y="20" font-size="9" font-weight="bold" fill="white">/</text>
                </svg>
            `;
            floatBtn.style.cssText = `
                position: fixed; bottom: 24px; right: 24px; width: 52px; height: 52px;
                background: #0066ff; border-radius: 50%; display: flex; align-items: center; justify-content: center;
                cursor: pointer; box-shadow: 0 4px 12px rgba(0, 102, 255, 0.3); z-index: 2147483646; transition: all 0.2s ease; opacity: 0.85;
            `;
            document.body.appendChild(floatBtn);

            // 存储引用
            this.elements = {
                overlay,
                input: document.getElementById('zh-search-input'),
                closeBtn: document.getElementById('zh-search-close'),
                submitBtn: document.getElementById('zh-search-submit'),
                floatBtn
            };
        },

        // 绑定事件
        bindEvents() {
            const { overlay, input, closeBtn, submitBtn, floatBtn } = this.elements;

            // 交互动画与点击
            closeBtn.onmouseenter = () => closeBtn.style.background = '#f0f0f0';
            closeBtn.onmouseleave = () => closeBtn.style.background = 'none';
            closeBtn.onclick = () => this.hide();

            submitBtn.onmouseenter = () => submitBtn.style.background = '#0052cc';
            submitBtn.onmouseleave = () => submitBtn.style.background = '#0066ff';
            submitBtn.onclick = () => this.performSearch();

            floatBtn.onmouseenter = () => { floatBtn.style.transform = 'scale(1.08)'; floatBtn.style.opacity = '1'; };
            floatBtn.onmouseleave = () => { floatBtn.style.transform = 'scale(1)'; floatBtn.style.opacity = '0.85'; };
            floatBtn.onclick = (e) => { e.stopPropagation(); this.show(); };

            overlay.onclick = (e) => { if (e.target === overlay) this.hide(); };

            input.onkeydown = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); this.performSearch(); }
            };

            // 全局快捷键
            window.addEventListener('keydown', (e) => {
                // ESC 关闭
                if (e.key === 'Escape' && overlay.style.display === 'flex') {
                    e.preventDefault();
                    this.hide();
                    return;
                }

                // 检查按下的键是否为 "/"
                if (e.key === '/' || e.code === 'Slash') {
                    // 判断是否在输入框内
                    const active = document.activeElement;
                    const isInputActive = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);

                    if (!isInputActive) {
                        e.preventDefault(); // 阻止浏览器原生搜索
                        this.show();
                    }
                }
            });
        },

        show() {
            this.elements.overlay.style.display = 'flex';
            this.elements.input.value = '';
            setTimeout(() => this.elements.input.focus(), 30);
        },

        hide() {
            this.elements.overlay.style.display = 'none';
            this.elements.input.blur();
        },

        performSearch() {
            const query = this.elements.input.value.trim();
            if (!query) {
                this.elements.input.style.transform = 'translateX(4px)';
                setTimeout(() => this.elements.input.style.transform = '', 150);
                return;
            }
            window.location.href = `${CONFIG.targetSearchUrl}?type=content&q=${encodeURIComponent(query)}`;
            this.hide();
        },

        init() {
            // 等待 DOM 加载完毕后挂载 UI
            document.addEventListener('DOMContentLoaded', () => {
                this.buildUI();
                this.bindEvents();
                console.log('[知乎优化助手] 搜索模块已挂载，按 “/” 唤出');
            });
        }
    };

    /* =========================================================================
     * [生命周期控制] 主程序入口
     * ========================================================================= */
    function bootstrap() {
        // 1. 尝试拦截路由。如果发生了重定向，则中止后续 DOM 操作
        if (Router.init()) return;

        // 2. 注入去广告与原生搜索的 CSS（由于配置了 @run-at document-start，CSS 会在页面渲染前生效，避免闪烁）
        Blocker.init();

        // 3. 初始化自定义搜索模块
        CustomSearch.init();
    }

    // 启动脚本
    bootstrap();

})();