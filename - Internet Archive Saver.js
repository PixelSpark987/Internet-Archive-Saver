// ==UserScript==
// @name         - Internet Archive Saver - testing
// @description  Saves visited pages to the Internet Archive.
// @namespace    https://is.gd/PS987
// @homepage     https://github.com/PixelSpark987/Internet-Archive-Saver/
// @downloadURL  https://raw.githubusercontent.com/PixelSpark987/Internet-Archive-Saver/refs/heads/main/-%20Internet%20Archive%20Saver.js
// @updateURL    https://raw.githubusercontent.com/PixelSpark987/Internet-Archive-Saver/refs/heads/main/-%20Internet%20Archive%20Saver.js
// @author       PixelSpark987 - https://is.gd/PS987
// @icon         https://is.gd/IASVG
// @version      4.9.4
// @grant        GM_xmlhttpRequest
// @connect      archive.org
// @noframes

// @match        *://*/*

// Excluded for Privacy
// @exclude      *://my.nextdns.io/*
// @exclude      *://accounts.google.com/*
// @exclude      *://myactivity.google.com/*
// @exclude      *://account.sony.com/*
// @exclude      *://id.sonyentertainmentnetwork.com/*
// @exclude      *://github.com/*/*/edit/*
// @exclude      *://gemini.google.com/*
// @exclude      *://mail.google.com/*
// @exclude      *://carrd.co/dashboard*
// @exclude      *://localhost/*
// @exclude      *://192.168.*
// @exclude      *://169.254.*
// @exclude      *://172.16.*
// @exclude      *://172.31.*
// @exclude      *://10.*

// Excluded by IA
// @exclude      *://*.loader.to/*

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

    const STATUS_CONFIG = {
        jitter:       ["Jittering",                      "#000055"],
        checking:     ["Checking - Asking IA for Info",  "#242424"],
        attempting:   ["Attempting to Archive",          "#363636"],
        archiving:    ["Archiving",                      "#454545"],
        unrequired:   ["Unrequired - Last Save <6H Ago", "#ff9800"],
        successAgain: ["Archived",                       "#aa00aa"],
        successFirst: ["FIRST ARCHIVAL",                 "#ff00ff"],
        // Errors / Alternative Fallbacks
        excluded:     ["Excluded from IA",               "#d35400"],
        rateLimited:  ["Rate Limited by IA",            "#d35400"],
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
    let iaMenu = null;
    let isMenuOpen = false;
    let lastHref = location.href;
    let currentRetryWait = 5000;
    let countdownInterval = null;
    let fadeTimeout = null;
    let lastStatusArgs = null;
    let lastJitterSeconds = null;

    // --- CSP / TRUSTED TYPES DETECTOR & SAFE CONTENT SETTER ---
    function setSafeContent(element, contentText) {
        try {
            if (window.trustedTypes && window.trustedTypes.createPolicy) {
                try {
                    const policy = window.trustedTypes.defaultPolicy ||
                                   window.trustedTypes.createPolicy('iaSaverPolicy', {
                                       createHTML: (str) => str
                                   });
                    element.innerHTML = policy.createHTML(contentText);
                    return;
                } catch (policyErr) {
                    // Fall back if policy creation is blocked
                }
            }
            element.innerHTML = contentText;
        } catch (e) {
            element.textContent = contentText;
        }
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        if (bytes < 1024) return bytes + ' Bytes';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    // --- JITTER GENERATOR & EXECUTION HANDLER ---
    function executeWithJitter(taskCallback) {
        if (countdownInterval) clearInterval(countdownInterval);

        // Select seconds (1 to 5) ensuring it never matches lastJitterSeconds
        let chosenSeconds;
        do {
            chosenSeconds = Math.floor(Math.random() * 5) + 1;
        } while (chosenSeconds === lastJitterSeconds);
        lastJitterSeconds = chosenSeconds;

        // Fully randomize milliseconds (0-999ms)
        const chosenMs = Math.floor(Math.random() * 1000);
        let totalJitterMs = (chosenSeconds * 1000) + chosenMs;

        // Ensure total delay never pushes past 5.5 seconds (5500ms)
        if (totalJitterMs > 5500) {
            totalJitterMs = 5500;
        }

        let elapsedSec = 1;
        const totalTargetSec = Math.round(totalJitterMs / 1000);

        showBadge(`${STATUS_CONFIG.jitter[0]} - ${elapsedSec} sec`, STATUS_CONFIG.jitter[1], "Adding randomized delay before sending request");

        const startTime = Date.now();
        countdownInterval = setInterval(() => {
            const currentElapsed = Math.floor((Date.now() - startTime) / 1000) + 1;
            if (currentElapsed !== elapsedSec && currentElapsed <= totalTargetSec) {
                elapsedSec = currentElapsed;
                showBadge(`${STATUS_CONFIG.jitter[0]} - ${elapsedSec} sec`, STATUS_CONFIG.jitter[1], "Adding randomized delay before sending request");
            }
        }, 200);

        setTimeout(() => {
            if (countdownInterval) clearInterval(countdownInterval);
            taskCallback();
        }, totalJitterMs);
    }

    // --- MENU HANDLING ---
    function toggleMenu() {
        isMenuOpen = !isMenuOpen;
        if (isMenuOpen && iaMenu && iaBadge) {
            iaMenu.style.display = "flex";
            iaBadge.style.opacity = "1";
        } else {
            closeMenu();
        }
    }

    function closeMenu() {
        isMenuOpen = false;
        if (iaMenu) iaMenu.style.display = "none";
        if (iaBadge && !iaBadge.matches(':hover')) {
            iaBadge.style.opacity = "0.25";
        }
    }

    document.addEventListener('click', (e) => {
        if (isMenuOpen && iaMenu && !iaMenu.contains(e.target) && e.target !== iaBadge) {
            closeMenu();
        }
    });

    // --- STANDARD TEXT BADGE ---
    function showBadge(statusText, color, title){
        if (!SHOW_BADGES) return;
        lastStatusArgs = { statusText, color, title };

        const targetParent = document.body || document.documentElement;
        if (!targetParent) return;

        if (!iaBadge || !targetParent.contains(iaBadge)) {
            if (iaBadge) iaBadge.remove();

            iaBadge = document.createElement("div");
            iaBadge.style.cssText = `
                position: fixed !important;
                display: block !important;
                bottom: 5px !important;
                right: 12px !important;
                color: #fff !important;
                padding: 5px 10px !important;
                user-select: none !important;
                cursor: pointer !important;
                font-size: 13px !important;
                line-height: 1.2 !important;
                font-weight: normal !important;
                letter-spacing: normal !important;
                text-transform: none !important;
                white-space: nowrap !important;
                border-radius: 20px !important;
                z-index: 1000000000 !important;
                font-family: Arial, sans-serif !important;
                width: auto !important;
                height: auto !important;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2) !important;
                margin: 0 !important;
                opacity: 0.25;
                transition: opacity 1.0s ease !important;
                transform-origin: bottom right !important;
                box-sizing: content-box !important;
            `;

            iaBadge.onclick = (e) => {
                e.stopPropagation();
                toggleMenu();
            };

            iaBadge.onmouseenter = () => { if (fadeTimeout) clearTimeout(fadeTimeout); iaBadge.style.opacity = "1"; };
            iaBadge.onmouseleave = () => { if (!isMenuOpen) iaBadge.style.opacity = "0.25"; };

            targetParent.appendChild(iaBadge);
        }

        if (!iaMenu || !targetParent.contains(iaMenu)) {
            if (iaMenu) iaMenu.remove();

            iaMenu = document.createElement("div");
            iaMenu.style.cssText = `
                position: fixed !important;
                display: none;
                bottom: 35px !important;
                right: 12px !important;
                background-color: #242424 !important;
                color: #fff !important;
                padding: 4px 0 !important;
                border-radius: 8px !important;
                z-index: 1000000001 !important;
                font-family: Arial, sans-serif !important;
                font-size: 12px !important;
                line-height: 1.2 !important;
                box-shadow: 0 4px 10px rgba(0,0,0,0.5) !important;
                flex-direction: column !important;
                min-width: 130px !important;
                overflow: hidden !important;
                box-sizing: content-box !important;
            `;

            const createMenuItem = (text, action) => {
                const item = document.createElement("div");
                setSafeContent(item, text);
                item.style.cssText = `
                    padding: 8px 16px !important;
                    cursor: pointer !important;
                    transition: background-color 0.2s !important;
                    color: #fff !important;
                    font-size: 12px !important;
                    line-height: 1.2 !important;
                    white-space: nowrap !important;
                `;
                item.onmouseenter = () => { item.style.backgroundColor = "#454545"; };
                item.onmouseleave = () => { item.style.backgroundColor = "transparent"; };
                item.onclick = (e) => {
                    e.stopPropagation();
                    action();
                    closeMenu();
                };
                return item;
            };

            const viewIA = createMenuItem("View in IA", () => {
                window.open('https://web.archive.org/web/*/' + location.href, '_blank');
            });

            const sendArchiveIs = createMenuItem("Send to archive.is", () => {
                window.open('https://archive.is/?run=1&url=' + encodeURIComponent(location.href), '_blank');
            });

            iaMenu.appendChild(viewIA);
            iaMenu.appendChild(sendArchiveIs);
            targetParent.appendChild(iaMenu);
        }

        const oldBase = iaBadge.textContent ? iaBadge.textContent.split(" - ")[0] : "";
        const newBase = statusText.split(" - ")[0];

        if (oldBase !== newBase) {
            iaBadge.style.opacity = "1";
            if (fadeTimeout) clearTimeout(fadeTimeout);
            fadeTimeout = setTimeout(() => {
                if (!iaBadge.matches(':hover') && !isMenuOpen) iaBadge.style.opacity = "0.25";
            }, 3000);
        }

        setSafeContent(iaBadge, statusText);
        iaBadge.style.setProperty("background", color, "important");
        iaBadge.title = title;
    }

    // --- GENERAL BACKEND PROCESSING ---
    function timestampConvert(ts){
        return Date.parse(ts.replace(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/, '$4:$5:$6 $2/$3/$1 GMT'));
    }

    function isEmpty(obj) { return Object.keys(obj).length === 0; }

    function runIAScript() {
        if (countdownInterval) clearInterval(countdownInterval);

        if (iaBadge) { iaBadge.remove(); iaBadge = null; }
        if (iaMenu) { iaMenu.remove(); iaMenu = null; isMenuOpen = false; }

        executeWithJitter(() => {
            showBadge(STATUS_CONFIG.checking[0], STATUS_CONFIG.checking[1], "Requesting final URL without cookies");

            GM_xmlhttpRequest({
                method: 'GET',
                url: location.href,
                anonymous: true,
                timeout: 20000,
                onload: function(data){
                    if (data.status == 403 || data.status == 404) {
                        showBadge(STATUS_CONFIG.excluded[0], STATUS_CONFIG.excluded[1], "This site is blocked by IA. Click to save to archive.is.");
                        return;
                    }
                    if (data.status == 429) {
                        showBadge(STATUS_CONFIG.rateLimited[0], STATUS_CONFIG.rateLimited[1], "Rate limited by IA. Click to save to archive.is.");
                        setTimeout(() => { currentRetryWait += 5000; runIAScript(); }, currentRetryWait);
                    } else {
                        archiving_necessity_check(data.finalUrl);
                    }
                },
                onerror: function() { setTimeout(() => runIAScript(), 5000); },
                ontimeout: function() { setTimeout(() => runIAScript(), 5000); }
            });
        });
    }

    function archiving_necessity_check(url){
        executeWithJitter(() => {
            showBadge(STATUS_CONFIG.attempting[0], STATUS_CONFIG.attempting[1], "Checking availability");

            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://archive.org/wayback/available?url=' + encodeURIComponent(url),
                timeout: 20000,
                onload: function(data){
                    if (data.status == 403 || data.status == 404) {
                        showBadge(STATUS_CONFIG.excluded[0], STATUS_CONFIG.excluded[1], "Site excluded from Wayback Machine. Click to save to archive.is.");
                        return;
                    }
                    if (data.status == 429) {
                        showBadge(STATUS_CONFIG.rateLimited[0], STATUS_CONFIG.rateLimited[1], "Rate limited by IA. Click to save to archive.is.");
                        setTimeout(() => { currentRetryWait += 5000; archiving_necessity_check(url); }, currentRetryWait);
                        return;
                    }
                    try {
                        data = JSON.parse(data.responseText);
                        if (isEmpty(data.archived_snapshots)){
                            archive(url, true);
                        } else {
                            var last_save = timestampConvert(data.archived_snapshots.closest.timestamp);
                            if (Date.now() - last_save > 21600000){
                                archive(url, false);
                            } else {
                                showBadge(STATUS_CONFIG.unrequired[0], STATUS_CONFIG.unrequired[1], "Already archived recently");
                            }
                        }
                    } catch(e) {
                        setTimeout(() => archiving_necessity_check(url), 5000);
                    }
                },
                onerror: function() { setTimeout(() => runIAScript(), 5000); },
                ontimeout: function() { setTimeout(() => runIAScript(), 5000); }
            });
        });
    }

    function archive(url, first){
        executeWithJitter(() => {
            showBadge(STATUS_CONFIG.archiving[0] + " - 0 Bytes", STATUS_CONFIG.archiving[1], "Sending to IA");

            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://web.archive.org/save/' + url,
                timeout: 45000,
                onprogress: function(event) {
                    if (event.lengthComputable || event.loaded > 0) {
                        const progressData = formatBytes(event.loaded);
                        showBadge(STATUS_CONFIG.archiving[0] + " - (" + progressData + ")", STATUS_CONFIG.archiving[1], "Sending to IA");
                    }
                },
                onload: function(data){
                    if (data.status == 200){
                        const totalBytes = data.responseText ? data.responseText.length : 0;
                        const finalDataSize = formatBytes(totalBytes);

                        const success = first ? STATUS_CONFIG.successFirst : STATUS_CONFIG.successAgain;
                        showBadge(success[0] + " - " + finalDataSize, success[1], "Success!");
                        currentRetryWait = 5000;
                    } else if (data.status == 403 || data.status == 404) {
                        showBadge(STATUS_CONFIG.excluded[0], STATUS_CONFIG.excluded[1], "Archival blocked for this URL. Click to save to archive.is.");
                    } else if (data.status == 429) {
                        showBadge(STATUS_CONFIG.rateLimited[0], STATUS_CONFIG.rateLimited[1], "Rate limited by IA. Click to save to archive.is.");
                        setTimeout(() => { currentRetryWait += 5000; archive(url, first); }, currentRetryWait);
                    } else {
                        setTimeout(() => runIAScript(), 5000);
                    }
                },
                onerror: function() { setTimeout(() => runIAScript(), 5000); },
                ontimeout: function() { setTimeout(() => runIAScript(), 5000); }
            });
        });
    }

    // --- TRACKING LOOPS ---
    setInterval(() => {
        if (location.href !== lastHref) {
            lastHref = location.href;
            currentRetryWait = 5000;
            if (iaBadge) { iaBadge.remove(); iaBadge = null; }
            if (iaMenu) { iaMenu.remove(); iaMenu = null; isMenuOpen = false; }
            runIAScript();
        } else {
            const targetParent = document.body || document.documentElement;
            if (targetParent && iaBadge && !targetParent.contains(iaBadge) && lastStatusArgs) {
                showBadge(lastStatusArgs.statusText, lastStatusArgs.color, lastStatusArgs.title);
            }
        }
    }, 500);

    if (document.body) { runIAScript(); } else { window.addEventListener('DOMContentLoaded', runIAScript); }
})();
