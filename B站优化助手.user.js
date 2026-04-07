// ==UserScript==
// @name         B站优化助手 (首页重定向 + 屏蔽广告卡片)
// @namespace    http://tampermonkey.net/
// @version      0.0.1
// @description  模块化整合：1. 将B站首页重定向到搜索页 2. 动态屏蔽包含 bili-video-card__info--ad-creative 等类的广告视频卡片
// @author       You & Assistant
// @match        *://*.bilibili.com/*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        GM_addStyle
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    /* =========================================================================
     * [配置中心] 集中管理选择器、路由和基础配置，方便后续拓展
     * ========================================================================= */
    const CONFIG = {
        // 重定向配置
        redirect: {
            // 需要拦截的域名（排除 search.bilibili.com 防止无限循环）
            hostnames: ['www.bilibili.com', 'bilibili.com'],
            // 需要拦截的路径 (首页)
            pathname: '/',
            // 目标重定向地址
            targetUrl: 'https://search.bilibili.com'
        },

        // 广告卡片配置
        ads: {
            // 广告的核心标识类名
            selectors: [
                '.bili-video-card__info--ad-creative',
                '.ad-feedback-entry'
            ],
            // 向上寻找的视频卡片容器类名
            cardSelector: '.bili-video-card'
        }
    };

    /* =========================================================================
     * [模块 1] Router - 路由拦截与重定向
     * ========================================================================= */
    const Router = {
        init() {
            const currentHost = window.location.hostname;
            const currentPath = window.location.pathname;

            // 检查是否匹配重定向条件（域名匹配且为根目录首页）
            const isTargetHost = CONFIG.redirect.hostnames.includes(currentHost);
            const isHomePage = (currentPath === '/');

            if (isTargetHost && isHomePage) {
                // 使用 replace 替换当前历史记录，避免后退时死循环
                window.location.replace(CONFIG.redirect.targetUrl);
                return true; // 返回 true 表示已重定向，中断后续脚本
            }
            return false;
        }
    };

    /* =========================================================================
     * [模块 2] Blocker - 广告屏蔽器 (CSS + DOM Observer)
     * ========================================================================= */
    const Blocker = {
        // 注入全局 CSS 隐藏元素 (利用最新的 :has 伪类，防止 DOM 脚本执行前的闪烁)
        injectCSS() {
            // 让包含广告元素的卡片瞬间隐形，避免视频封面闪烁。
            // 随后的 removeAds 方法会彻底隐藏其父容器，修复布局排版留白。
            const cssString = `
                ${CONFIG.ads.selectors.map(sel => `${CONFIG.ads.cardSelector}:has(${sel})`).join(', ')} {
                    visibility: hidden !important;
                }
            `;
            try {
                GM_addStyle(cssString);
            } catch (e) {
                // 如果环境不支持 GM_addStyle
                const style = document.createElement('style');
                style.textContent = cssString;
                document.head.appendChild(style);
            }
        },

        // 移除广告 DOM 节点 (彻底隐藏父容器避免布局留白)
        removeAds() {
            const adElements = document.querySelectorAll(CONFIG.ads.selectors.join(', '));

            adElements.forEach(el => {
                const card = el.closest(CONFIG.ads.cardSelector);
                if (card) {
                    // 获取卡片的父级容器（通常是 col_3 等栅格布局容器）
                    const container = card.parentElement;
                    if (container && container.style.display !== 'none') {
                        container.style.display = 'none';
                        // console.log('[B站优化助手] 已屏蔽一个动态广告卡片');
                    }
                }
            });
        },

        // 监听动态加载的 DOM 变化 (如滚动页面时加载的新视频)
        initObserver() {
            const observer = new MutationObserver((mutations) => {
                let shouldCheck = false;
                for (const mutation of mutations) {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        shouldCheck = true;
                        break;
                    }
                }

                if (shouldCheck) {
                    this.removeAds();
                }
            });

            // 监听整个文档，确保不论何时加载新元素都能捕捉到
            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });
        },

        init() {
            // 尽早注入 CSS 避免闪屏
            if (document.head) {
                this.injectCSS();
            } else {
                document.addEventListener('DOMContentLoaded', () => this.injectCSS());
            }

            // 初始化 DOM 观察者与初始清理
            this.initObserver();

            // 页面加载完成后再执行一次兜底清理
            document.addEventListener('DOMContentLoaded', () => this.removeAds());
        }
    };

    /* =========================================================================
     * [生命周期控制] 主程序入口
     * ========================================================================= */
    function bootstrap() {
        // 1. 尝试拦截路由。如果发生了重定向，则终止后续 DOM 操作以节省性能
        if (Router.init()) {
            console.log('[B站优化助手] 已从首页重定向至搜索页');
            return;
        }

        // 2. 启动去广告模块
        Blocker.init();
    }

    // 启动脚本
    bootstrap();

})();