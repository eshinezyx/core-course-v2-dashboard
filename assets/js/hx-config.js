/* =========================================================
 * HX_Dashboard hx-config.js — Tailwind 运行时配置注入
 * 注意：必须在 Tailwind Play CDN <script> 之后同步加载
 * 作用：新色板 + 恒行色 token（v2 页面使用；
 *       v1 页面的 inline tailwind.config 会覆盖此文件，故 v1 换肤靠 hx-theme.css 的 CSS 重定向）
 * ========================================================= */

/* v2 页面在 CDN 后加载本文件时生效 */
if (typeof tailwind !== 'undefined') {
    tailwind.config = {
        theme: {
            extend: {
                fontFamily: { sans: ['Inter', 'SF Pro Display', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'] },
                colors: {
                    brand: {
                        50: '#edf4ff', 100: '#dce9ff', 200: '#c7d8f5', 300: '#8cabe0',
                        400: '#6f9bea', 500: '#2f6fed', 600: '#2463df', 700: '#1f5fd5', 900: '#0d3c99',
                    },
                    ink: '#14213d',
                    nav: { DEFAULT: '#111b31', light: '#202c44' },
                    paper: '#f4f6f9',
                    hxline: { DEFAULT: '#dbe3ef', light: '#edf1f7' },
                    quota: { lead: '#c9efe1', normal: '#e7f0fb', low: '#ffebbd', risk: '#f9d7dc' },
                },
                boxShadow: {
                    card: '0 4px 14px rgba(31,52,91,.045)',
                    pop: '0 10px 26px rgba(31,52,91,.08)',
                },
            },
        },
    };
}
