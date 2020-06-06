const assert = require("assert");
const common = require('../puppeteer_lib/common');

async function site_tests(page){
    page.on('console', msg => console.log('LOG', msg.text()));
    await common.log_in(page);
    await page.waitForSelector("#zhome", {visible: true})
    console.log("Sanity-checking existing messages");
    const msg = await common.get_rendered_messages(page, 'zhome');

    msg.headings.forEach((heading) => {
        assert.match(common.normalize_spaces(heading),
                     /(^You and )|( )/,
                     "Heading isn't well-formed");
    });

    console.log('Sending messages');
    await common.send_multiple_messages(page, [
        { stream: 'Verona', subject: 'frontend test',
          content: 'test verona A' },

        { stream: 'Verona', subject: 'frontend test',
          content: 'test verona B' },

        { stream: 'Verona', subject: 'other subject',
          content: 'test verona C' },

        { recipient: 'cordelia@zulip.com, hamlet@zulip.com',
          content: 'personal A' },

        { recipient: 'cordelia@zulip.com, hamlet@zulip.com',
          content: 'personal B' },

        { recipient: 'cordelia@zulip.com',
          content: 'personal C' }
    ]);

    await common.expected_messages(page, 'zhome', [
        'Verona > frontend test',
        'Verona > other subject',
        'You and Cordelia Lear, King Hamlet',
        'You and Cordelia Lear',
    ], [
        '<p>test verona A</p>',
        '<p>test verona B</p>',
        '<p>test verona C</p>',
        '<p>personal A</p>',
        '<p>personal B</p>',
        '<p>personal C</p>',
    ]);

    console.log("Sending more messages.");
    await common.send_multiple_messages(page, [
        { stream: 'Verona', subject: 'frontend test',
          content: 'test verona D' },

        { recipient: 'cordelia@zulip.com, hamlet@zulip.com',
          content: 'personal D' },
    ]);

    await common.log_out(page);
}

common.run_test(site_tests);