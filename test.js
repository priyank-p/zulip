const settings_config = require("./settings_config");
const settings_data = require("./settings_data");
const render_admin_tab = require('../templates/admin_tab.hbs');
const test = require(var_name);

exports.var_arr = [1,2,3];
exports.var_str = 'Test';
exports.var_bool = true;
exports.arrow_func = () => false;
exports.func_no_args = function () {
  console.log("test");
}

exports.func_with_args = function (arg) {
  console.log(arg);
}
