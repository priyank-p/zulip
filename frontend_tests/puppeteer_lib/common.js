const path = require('path');
const puppeteer = require('puppeteer');
const assert = require("assert");
const test_credentials = require('../../var/casper/test_credentials.js').test_credentials;


class CommonUtils {
    constructor() {
        this.browser = null;
        this.screenshot_id = 0;
        this.realm_url = "http://zulip.zulipdev.com:9981/";
        this.last_send_or_update = -1;
    }

    timestamp() {
        return new Date().getTime();
    }

    async ensure_browser() {
        if (this.browser === null) {
            this.browser = await puppeteer.launch({
                args: [
                    '--window-size=1400,1024',
                    '--no-sandbox', '--disable-setuid-sandbox',
                ],
                defaultViewport: { width: 1280, height: 1024 },
                headless: true,
            });
        }
    }

    async get_page(url = null) {
        await this.ensure_browser();

        const page = await this.browser.newPage();
        if (url !== null) {
            await page.goto(url);
        }

        return page;
    }

    async screenshot(page, name = null) {
        if (name === null) {
            name = `${this.screenshot_id}`;
            this.screenshot_id += 1;
        }

        const root_dir = path.resolve(__dirname, '../../');
        const screenshot_path = path.join(root_dir, 'var/puppeteer', `${name}.png`);
        await page.screenshot({
            path: screenshot_path,
        });
    }

    async set_pm_recipient(page, recipient) {
        await page.type("#private_message_recipient", recipient);
        await page.keyboard.press("Enter");
    }

    /**
     * This function takes a params object whose fields
     * are referenced by name attribute of an input field and
     * the input as a key.
     *
     * For example to fill:
     *  <form id="#demo">
     *     <input type="text" name="username">
     *     <input type="checkbox" name="terms">
     *  </form>
     *
     * You can call:
     * common.fill_form(page, '#demo', {
     *     username: 'Iago',
     *     terms: true
     * });
     */
    async fill_form(page, form_selector, params) {
        for (const name of Object.keys(params)) {
            const name_selector = `${form_selector} [name="${name}"]`;
            const value = params[name];
            if (typeof value === "boolean") {
                await page.$eval(name_selector, (el, value) => {
                    if (el.checked !== value) {
                        el.click();
                    }
                });
            } else {
                await page.type(name_selector, params[name]);
            }
        }
    }

    async log_in(page, credentials = null) {
        console.log("Logging in");
        await page.goto(this.realm_url + 'login/');
        assert.equal(this.realm_url + 'login/', page.url());
        if (credentials === null) {
            credentials = test_credentials.default_user;
        }
        // fill login form
        const params = {
            username: credentials.username,
            password: credentials.password,
        };
        await this.fill_form(page, '#login_form', params);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'load' }),
            page.$eval('#login_form', form => form.submit())
        ]);
    }

    async log_out(page) {
        await page.goto(this.realm_url);
        const menu_selector = '#settings-dropdown';
        const logout_selector = 'a[href="#logout"]';
        console.log("Loggin out");
        await page.waitForSelector(menu_selector, {visible: true});
        await page.click(menu_selector);
        await page.waitForSelector(logout_selector);
        await page.click(logout_selector);

        // Wait for a email input in login page so we know login
        // page is loaded. Then check that we are at the login url.
        await page.waitForSelector('input[name="username"]');
        assert(page.url().includes('/login/'));
    }

    async turn_off_press_enter_to_send(page) {
        await page.$eval("#enter_sends", (el) => {
            if (el.checked) {
                el.click();
            }
        });
    }

    async wait_for_message_fully_processed(page, content) {
        return await page.evaluate((content) => {
            /*
                The tricky part about making sure that
                a message has actually been fully processed
                is that we'll "locally echo" the message
                first on the client.  Until the server
                actually acks the message, the message will
                have a temporary id and will not have all
                the normal message controls.

                For the Casper tests, we want to avoid all
                the edge cases with locally echoed messages.

                In order to make sure a message is processed,
                we use internals to determine the following:
                    - has message_list even been updated with
                      the message with out content?
                    - has the locally_echoed flag been cleared?

                But for the final steps we look at the
                actual DOM (via JQuery):
                    - is it visible?
                    - does it look to have been
                      re-rendered based on server info?
            */
            const last_msg = current_msg_list.last();

            if (last_msg.raw_content !== content) {
                return false;
            }

            if (last_msg.locally_echoed) {
                return false;
            }

            const row = rows.last_visible();

            if (rows.id(row) !== last_msg.id) {
                return false;
            }

            /*
                Make sure the message is completely
                re-rendered from its original "local echo"
                version by looking for the star icon.  We
                don't add the star icon until the server
                responds.
            */
            return row.find('.star').length === 1;
        }, content);
    }

    // Wait for any previous send to finish, then send a message.
    async send_message(page, type, params) {
        // If a message is outside the view, we will skip
        // validation later.
        const outside_view = params.outside_view;
        delete params.outside_view;

        await page.waitForSelector('#compose-send-button:enabled');
        await page.waitForSelector('#compose-textarea');

        if (type === "stream") {
            await page.keyboard.press('KeyC');
        } else if (type === "private") {
            await page.keyboard.press("KeyX");
            const recipients = params.recipient.split(', ')
            for(let i=0; i < recipients.length; i+=1)
                await this.set_pm_recipient(page, recipients[i]);
            delete params.recipient;
        } else {
            assert.fail("`send_message` got invalid message type");
        }

        if (params.stream) {
            params.stream_message_recipient_stream = params.stream;
            delete params.stream;
        }

        if (params.subject) {
            params.stream_message_recipient_topic = params.subject;
            delete params.subject;
        }

        await this.fill_form(page, 'form[action^="/json/messages"]', params);
        await this.turn_off_press_enter_to_send(page);
        await page.waitForSelector("#compose-send-button", {visible: true})
        await page.click('#compose-send-button');

        // confirm if compose box is empty.
        await page.waitForSelector('#compose-textarea')
        const compose_box_element = await page.$("#compose-textarea");
        const compose_box_content = await page.evaluate(element => element.textContent, compose_box_element);
        assert.equal(compose_box_content, '', 'Compose box not empty after message sent');

        if (!outside_view) {
            await this.wait_for_message_fully_processed(page, params.content);
        }

        page.evaluate(() => {
            compose_actions.cancel();
        });

        this.last_send_or_update = this.timestamp();
    }

    async send_multiple_messages(page, msgs) {
        for (let msg_index = 0; msg_index<msgs.length; msg_index+=1){
            let msg = msgs[msg_index]
            await this.send_message(
                page,
                msg.stream !== undefined ? 'stream' : 'private',
                msg
            );
        }
    }

    async get_rendered_messages(page, table) {

        const messages = await page.evaluate((table) => {
            const $ = window.$;
            const tbl = $('#' + table);
            return {
                headings: $.map(tbl.find('.recipient_row .message-header-contents'), function (elem) {
                    const $clone = $(elem).clone(true);
                    $clone.find(".recipient_row_date").remove();

                    return $clone.text().trim().replace(/\s+/g, ' ');
                }),

                bodies: $.map(tbl.find('.message_content'), function (elem) {
                    return elem.innerHTML;
                }),
            };
        }, table);
        return messages;
    }

    // Call get_rendered_messages and then check that the last few
    // headings and bodies match the specified arrays.
    async expected_messages(page, table, headings, bodies) {
        await page.waitForSelector('#' + table);

        const msg = await this.get_rendered_messages(page, table);

        assert.deepStrictEqual(
            msg.headings.slice(-headings.length), headings,
            "Didn't get expected message headings"
        );

        assert.deepStrictEqual(
            msg.bodies.slice(-bodies.length),
            bodies,
            "Didn't get expected message bodies"
        );
    }

    async run_test(test_function) {
        // Pass a page instance to test so we can take
        // a screenshot of it when the test fails.
        const page = await this.get_page();
        //await page.addScriptTag({url: 'https://code.jquery.com/jquery-3.2.1.min.js'})
        try {
            await test_function(page);
        } catch (e) {
            console.log(e);

            // Take a screenshot, and increment the screenshot_id.
            await this.screenshot(page, `failure-${this.screenshot_id}`);
            this.screenshot_id += 1;

            await this.browser.close();
            process.exit(1);
        } finally {
            this.browser.close();
        }
    }

    normalize_spaces(str) {
        return str.replace(/\s+/g, ' ');
    }
}

const common = new CommonUtils();
module.exports = common;
