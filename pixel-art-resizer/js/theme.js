'use strict';

(() => {
    const STORAGE_KEY = 'pixel-art-resizer-theme-v1';
    const root = document.documentElement;

    function readPreference() {
        try {
            const value = localStorage.getItem(STORAGE_KEY);
            return value === 'light' || value === 'dark' ? value : null;
        } catch {
            return null;
        }
    }

    function updateButton() {
        const button = document.getElementById('themeToggle');

        if (!button) {
            return;
        }

        const label = root.dataset.theme === 'dark'
            ? 'Switch to light mode'
            : 'Switch to dark mode';

        button.title = label;
        button.setAttribute('aria-label', label);
    }

    function applyTheme(theme, persist = false) {
        const selected = theme === 'light' ? 'light' : 'dark';
        root.dataset.theme = selected;

        const colorScheme = document.querySelector('meta[name="color-scheme"]');
        const themeColor = document.querySelector('meta[name="theme-color"]');

        if (colorScheme) {
            colorScheme.content = selected;
        }

        if (themeColor) {
            themeColor.content = selected === 'light' ? '#f6f7f9' : '#101114';
        }

        updateButton();

        if (persist) {
            try {
                localStorage.setItem(STORAGE_KEY, selected);
            } catch {
                // The current theme still works when storage is unavailable.
            }
        }
    }

    function bindToggle() {
        const button = document.getElementById('themeToggle');

        if (!button) {
            return;
        }

        updateButton();
        button.addEventListener('click', () => {
            applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true);
        });
    }

    applyTheme(readPreference() || 'dark');

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindToggle, { once: true });
    } else {
        bindToggle();
    }

    window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEY || event.key === null) {
            applyTheme(readPreference() || 'dark');
        }
    });
})();
