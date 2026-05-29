// ==UserScript==
// @name         - Internet Archive Saver
// @description  Saves visited pages to the Internet Archive.
// @namespace    https://is.gd/PS987
// @homepage     https://github.com/PixelSpark987/Internet-Archive-Saver/
// @downloadURL  https://raw.githubusercontent.com/PixelSpark987/Internet-Archive-Saver/refs/heads/main/-%20Internet%20Archive%20Saver.js
// @updateURL    https://raw.githubusercontent.com/PixelSpark987/Internet-Archive-Saver/refs/heads/main/-%20Internet%20Archive%20Saver.js
// @author       PixelSpark987
// @icon         https://is.gd/IASVG
// @version      4.6.0
// @grant        GM_xmlhttpRequest
// @connect      archive.org
// @noframes

// @match        *://*/*
// @exclude      *my.nextdns.io*
// @exclude      *accounts.google.com*
// @exclude      *myactivity.google.com*
// @exclude      *account.sony.com*
// @exclude      *id.sonyentertainmentnetwork.com*
// @exclude      *github.com/*/*/edit/*
// @exclude      *gemini.google.com*
// @exclude      *mail.google.com*
// @exclude      *://localhost*
// @exclude      *.loader.to/*
// @exclude      *tekmods.com
// @exclude      *pikabu.ru*
// @exclude      *psnprofiles.com*
// @exclude      *192.168.*
// @exclude      *169.254.*
// @exclude      *172.16.*
// @exclude      *172.31.*
// @exclude      *10.*.*.*

// ==/UserScript==

(function() {
    'use strict';

    // --- HANDLING FOR WEB.ARCHIVE.ORG AUTOMATION ---
    if (location.hostname.includes("archive.org")) {
        const hashMatch = location.hash.match(/#save-youtube-url=(.+)/);
        if (hashMatch) {
            const targetUrl = decodeURIComponent(hashMatch[1]);

            const iaObserver = new MutationObserver((mutations, obs) => {
                const urlInput = document.querySelector("input.web-save-url-input") ||
                                 document.querySelector("input[name='url']") ||
                                 document.getElementById("web-save-url");

                const outlinksCheck = document.getElementById("capture_outlinks") ||
                                      document.querySelector("input[name='capture_outlinks']") ||
                                      document.querySelector("input[type='checkbox']");

                if (urlInput) {
                    obs.disconnect();
                    urlInput.value = targetUrl;
                    urlInput.dispatchEvent(new Event('input', { bubbles: true }));
                    urlInput.dispatchEvent(new Event('change', { bubbles: true }));

                    if (outlinksCheck && !outlinksCheck.checked) {
                        outlinksCheck.click();
                        outlinksCheck.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            });

            iaObserver.observe(document.documentElement, { childList: true, subtree: true });
        }
        return;
    }

    // --- CONFIGURATION ---
    const SHOW_BADGES = true;
    const YT_BUTTON_IMAGE = 'https://is.gd/IASVG';

    const STATUS_CONFIG = {
        checking:     ["Checking - Asking IA for Info",  "#242424"],
        attempting:   ["Attempting to Archive",          "#363636"],
        archiving:    ["Archiving",                      "#454545"],
        unrequired:   ["Unrequired - Last Save <6H Ago", "#ff9800"],
        successAgain: ["Archived",                       "#aa00aa"],
        successFirst: ["FIRST ARCHIVAL",                 "#ff00ff"],
        // Errors
        excluded:     ["URL Excluded by IA",             "#000000"],
        rateLimited:  ["Rate Limited",                   "#ff3c00"],
        iaOverloaded: ["IA Overloaded - 503",            "#ff2e2e"],
        siteTimeout:  ["Site Timeout - 504",             "#ff2e2e"],
        requestHang:  ["Request Hang - Retrying",        "#ff2e2e"],
        cookieError:  ["Cookie Error - Retrying",        "#ff2e2e"],
        checkError:   ["Check Error - Retrying",         "#ff2e2e"],
        iaError:      ["IA Error - Retrying",            "#ff2e2e"],
        networkError: ["Network Error - Retrying",       "#ff2e2e"],
        parseError:   ["Parse Error - Retrying",         "#ff2e2e"]
    };

    let iaBadge = null;
    let lastHref = location.href;
    let currentRetryWait = 5000;
    let countdownInterval = null;
    let fadeTimeout = null;

    function isYouTubeVideo() {
        const host = location.hostname;
        const path = location.pathname;
        const search = location.search;
        return (host.includes("youtube.com") && (path.startsWith("/shorts/") || (path.startsWith("/watch") && search.includes("v="))));
    }

    // --- ENGINE FOR DISPATCHING BUTTONS BASED ON INTERFACE TYPE ---
    const handleYouTubeInjections = () => {
        if (!isYouTubeVideo()) {
            const b1 = document.getElementById('ia-saver-pill-btn');
            const b2 = document.getElementById('ia-saver-shorts-btn');
            if (b1) b1.remove();
            if (b2) b2.remove();
            return;
        }

        if (location.pathname.startsWith("/shorts/")) {
            injectShortsButton();
        } else {
            injectStandardVideoButton();
        }
    };

    // New Injection Block targeting Shorts Action Rails
    const injectShortsButton = () => {
        const targetAnchor = document.querySelector('.ytwReelActionBarViewModelHostDesktopActionButton.ytLikeButtonViewModelHost > toggle-button-view-model > .ytSpecButtonViewModelHost > .ytSpecButtonShapeWithLabelHost > .ytSpecButtonShapeNextEnableBackdropFilterExperiment.ytSpecButtonShapeNextIconButton.ytSpecButtonShapeNextSizeL.ytSpecButtonShapeNextMono.ytSpecButtonShapeNextTonal.ytSpecButtonShapeNextHost');

        if (targetAnchor && targetAnchor.parentNode && !document.getElementById('ia-saver-shorts-btn')) {
            const btn = document.createElement('button');
            btn.id = 'ia-saver-shorts-btn';
            btn.title = "Save This Short URL to Internet Archive";

            btn.style.cssText = `
                background: transparent !important;
                border: none !important;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                width: 48px;
                height: 48px;
                margin-top: 2px;
                margin-bottom: 8px;
                opacity: 0.8;
                transition: opacity 0.2s ease, transform 0.1s ease;
            `;

            const img = document.createElement('img');
            img.src = YT_BUTTON_IMAGE;
            img.style.width = '24px';
            img.style.height = '24px';
            img.style.display = 'block';

            btn.appendChild(img);

            btn.onmouseenter = () => { btn.style.opacity = '1'; };
            btn.onmouseleave = () => { btn.style.opacity = '0.8'; };
            btn.onmousedown = () => { btn.style.transform = 'scale(0.9)'; };
            btn.onmouseup = () => { btn.style.transform = 'scale(1)'; };

            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const spnMallUrl = `https://web.archive.org/save/#save-youtube-url=${encodeURIComponent(location.href)}`;
                window.open(spnMallUrl, '_blank');
            };

            // Prepend directly above the container row structure of the Like element
            targetAnchor.parentNode.insertBefore(btn, targetAnchor);
        }
    };

    // Standard Video Bar Injection Block
    const injectStandardVideoButton = () => {
        const targetAnchor = document.querySelector('.ytSpecButtonShapeNextEnableBackdropFilterExperiment.ytSpecButtonShapeNextSegmentedStart.ytSpecButtonShapeNextIconLeading.ytSpecButtonShapeNextSizeM.ytSpecButtonShapeNextMono.ytSpecButtonShapeNextTonal.ytSpecButtonShapeNextHost');

        if (targetAnchor && targetAnchor.parentNode && !document.getElementById('ia-saver-pill-btn')) {
            const btn = document.createElement('button');
            btn.id = 'ia-saver-pill-btn';
            btn.title = "Save This Video URL to Internet Archive";

            btn.style.cssText = `
                background: transparent !important;
                border: none !important;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                width: 36px;
                height: 36px;
                padding: 0;
                margin-right: 6px;
                margin-left: 2px;
                vertical-align: middle;
                opacity: 0.75;
                transition: opacity 0.2s ease, transform 0.1s ease;
            `;

            const img = document.createElement('img');
            img.src = YT_BUTTON_IMAGE;
            img.style.width = '20px';
            img.style.height = '20px';
            img.style.display = 'block';

            btn.appendChild(img);

            btn.onmouseenter = () => { btn.style.opacity = '1'; };
            btn.onmouseleave = () => { btn.style.opacity = '0.75'; };
            btn.onmousedown = () => { btn.style.transform = 'scale(0.9)'; };
            btn.onmouseup = () => { btn.style.transform = 'scale(1)'; };

            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const spnMallUrl = `https://web.archive.org/save/#save-youtube-url=${encodeURIComponent(location.href)}`;
                window.open(spnMallUrl, '_blank');
            };

            targetAnchor.parentNode.insertBefore(btn, targetAnchor);
        }
    };

    // --- STANDARD TEXT BADGE (FOR OTHER WEBSITES) ---
    function showBadge(statusText, color, title){
        if (!SHOW_BADGES || isYouTubeVideo()) return;

        if (!iaBadge) {
            iaBadge = document.createElement("div");
            iaBadge.style.position = "fixed";
            iaBadge.style.display = "block";
            iaBadge.style.bottom = "5px";
            iaBadge.style.right = "5px";
            iaBadge.style.color = "#fff";
            iaBadge.style.padding = "5px 10px";
            iaBadge.style.userSelect = "none";
            iaBadge.style.cursor = "pointer";
            iaBadge.style.fontSize = "12px";
            iaBadge.style.borderRadius = "20px";
            iaBadge.style.zIndex = "1000000000";
            iaBadge.style.fontFamily = "Arial, sans-serif";
            iaBadge.style.width = "initial";
            iaBadge.style.boxShadow = "0 2px 5px rgba(0,0,0,0.0)";
            iaBadge.style.margin = "0";
            iaBadge.style.opacity = "0.25";
            iaBadge.style.transition = "opacity 1.0s ease";
            iaBadge.style.transformOrigin = "bottom right";

            iaBadge.onclick = () => window.open('https://web.archive.org/web/*/' + location.href, '_blank');

            iaBadge.onmouseenter = () => { if (fadeTimeout) clearTimeout(fadeTimeout); iaBadge.style.opacity = "1"; };
            iaBadge.onmouseleave = () => { iaBadge.style.opacity = "0.25"; };

            document.documentElement.appendChild(iaBadge);
        }

        const oldBase = iaBadge.innerHTML.split(" - ")[0];
        const newBase = statusText.split(" - ")[0];

        if (oldBase !== newBase) {
            iaBadge.style.opacity = "1";
            if (fadeTimeout) clearTimeout(fadeTimeout);
            fadeTimeout = setTimeout(() => { if (!iaBadge.matches(':hover')) iaBadge.style.opacity = "0.25"; }, 3000);
        }

        iaBadge.innerHTML = statusText;
        iaBadge.style.background = color;
        iaBadge.title = title;
    }

    function formatTime(seconds) {
        if (seconds < 60) return seconds + "s";
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}m ${s}s`;
    }

    // --- GENERAL BACKEND PROCESSING ---
    function timestampConvert(ts){
        return Date.parse(ts.replace(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/, '$4:$5:$6 $2/$3/$1 GMT'));
    }

    function isEmpty(obj) { return Object.keys(obj).length === 0; }

    function runIAScript() {
        if (countdownInterval) clearInterval(countdownInterval);

        if (!isYouTubeVideo()) {
            if (iaBadge) { iaBadge.remove(); iaBadge = null; }
            showBadge(STATUS_CONFIG.checking[0], STATUS_CONFIG.checking[1], "Requesting final URL without cookies");
        }

        GM_xmlhttpRequest({
            method: 'GET',
            url: location.href,
            anonymous: true,
            timeout: 20000,
            onload: function(data){
                if (data.status == 403 || data.status == 404) {
                    showBadge(STATUS_CONFIG.excluded[0], STATUS_CONFIG.excluded[1], "This site is blocked by IA.");
                    return;
                }
                if (data.status == 429) {
                    setTimeout(() => { currentRetryWait += 5000; runIAScript(); }, currentRetryWait);
                } else {
                    archiving_necessity_check(data.finalUrl);
                }
            },
            onerror: function() { setTimeout(() => runIAScript(), 5000); },
            ontimeout: function() { setTimeout(() => runIAScript(), 5000); }
        });
    }

    function archiving_necessity_check(url){
        if (!isYouTubeVideo()) showBadge(STATUS_CONFIG.attempting[0], STATUS_CONFIG.attempting[1], "Checking availability");

        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://archive.org/wayback/available?url=' + encodeURIComponent(url),
            timeout: 20000,
            onload: function(data){
                if (data.status == 403 || data.status == 404) {
                    showBadge(STATUS_CONFIG.excluded[0], STATUS_CONFIG.excluded[1], "Site excluded from Wayback Machine.");
                    return;
                }
                if (data.status == 429) {
                    setTimeout(() => { currentRetryWait += 5000; archiving_necessity_check(url); }, currentRetryWait);
                    return;
                }
                try {
                    data = JSON.parse(data.responseText);
                    if (isEmpty(data.archived_snapshots)){
                        if (!isYouTubeVideo()) archive(url, true);
                    } else {
                        var last_save = timestampConvert(data.archived_snapshots.closest.timestamp);
                        if (Date.now() - last_save > 21600000){
                            if (!isYouTubeVideo()) archive(url, false);
                        } else {
                            if (!isYouTubeVideo()) {
                                showBadge(STATUS_CONFIG.unrequired[0], STATUS_CONFIG.unrequired[1], "Already archived recently");
                            }
                        }
                    }
                } catch(e) {
                   setTimeout(() => archiving_necessity_check(url), 5000);
                }
            },
            onerror: function() { setTimeout(() => runIAScript(), 5000); },
            ontimeout: function() { setTimeout(() => runIAScript(), 5000); }
        });
    }

    function archive(url, first){
        showBadge(STATUS_CONFIG.archiving[0], STATUS_CONFIG.archiving[1], "Sending to IA");

        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://web.archive.org/save/' + url,
            timeout: 45000,
            onload: function(data){
                if (data.status == 200){
                    const success = first ? STATUS_CONFIG.successFirst : STATUS_CONFIG.successAgain;
                    showBadge(success[0], success[1], "Success!");
                    currentRetryWait = 5000;
                } else if (data.status == 403 || data.status == 404) {
                    showBadge(STATUS_CONFIG.excluded[0], STATUS_CONFIG.excluded[1], "Archival blocked for this URL.");
                } else if (data.status == 429) {
                    setTimeout(() => { currentRetryWait += 5000; archive(url, first); }, currentRetryWait);
                } else {
                    setTimeout(() => runIAScript(), 5000);
                }
            },
            onerror: function() { setTimeout(() => runIAScript(), 5000); },
            ontimeout: function() { setTimeout(() => runIAScript(), 5000); }
        });
    }

    // --- TRACKING LOOPS ---
    setInterval(() => {
        if (location.href !== lastHref) {
            lastHref = location.href;
            currentRetryWait = 5000;
            if (iaBadge) { iaBadge.remove(); iaBadge = null; }
            runIAScript();
        }
    }, 500);

    // Continuous evaluation engine for dynamic content loading
    setInterval(handleYouTubeInjections, 1000);

    if (document.body) { runIAScript(); } else { window.addEventListener('DOMContentLoaded', runIAScript); }
})();
