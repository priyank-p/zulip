"use strict";

const fs = require("fs").promises;
const path = require("path");

let xvfb;
function initXvfb({width, height}) {
    const Xvfb = require("xvfb");
    xvfb = new Xvfb({silent: true, xvfb_args: ["-screen", "0", `${width}x${height}x24`, "-ac"]});
    xvfb.startSync();
}

const launchArgsOptions = [
    "--enable-usermedia-screen-capturing",
    "--allow-http-screen-capture",
    "--auto-select-desktop-capture-source=PuppeteerRecording",
    "--load-extension=" + __dirname,
    "--disable-extensions-except=" + __dirname,
];

async function startRecording(page) {
    await page._client.send("Emulation.clearDeviceMetricsOverride");
    await page.setBypassCSP(true);
    await page.waitForSelector("html.__PuppeteerScreenCapture_recorder_started__", {timeout: 0});
}

async function stopRecording(page, {filename = null, directory} = {}) {
    if (directory) {
        await page._client.send("Page.setDownloadBehavior", {
            behavior: "allow",
            downloadPath: directory,
        });
    }

    await page.evaluate((filename) => {
        window.postMessage({type: "SET_EXPORT_PATH", filename}, "*");
        window.postMessage({type: "REC_STOP"}, "*");
    }, filename);

    if (filename !== null) {
        await page.waitForSelector("html.__PuppeteerScreenCapture_download_complete__", {
            timeout: 0,
        });

        const savePath = path.join(directory, filename);
        const downloadPath = await page.evaluate(() => {
            const $html = document.querySelector("html");
            return $html.dataset.puppeteerRecordingFilename;
        });

        try {
            // Remove the old recording it exist!
            await fs.unlink(savePath);
        } catch (e) {
            /* Ignore the error */
        }

        await fs.rename(downloadPath, savePath);
    }

    if (xvfb) {
        xvfb.stopSync();
    }
}

module.exports = {
    launchArgsOptions,
    initXvfb,
    startRecording,
    stopRecording,
};
