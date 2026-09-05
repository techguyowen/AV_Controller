/**
 * public/js/nav.js
 * Lightweight helper for navigation highlighting
 */

window.SanctuaryNav = {
    init() {
        const path = window.location.pathname;
        const links = document.querySelectorAll('nav a');
        links.forEach(link => {
            const href = link.getAttribute('href');
            if (href === path || (href !== '/' && path.startsWith(href))) {
                link.classList.add('active');
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', () => window.SanctuaryNav.init());

