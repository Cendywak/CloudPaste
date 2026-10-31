/**
 * 纯文本输入框的公共工具
 */

// 关闭浏览器/输入法的自动纠错、自动大写等，避免改动用户粘贴的原文
export const rawTextareaAttrs = {
  spellcheck: "false",
  autocomplete: "off",
  autocorrect: "off",
  autocapitalize: "off",
};

/**
 * 在 textarea 中按 Tab 时插入制表符，而不是把焦点移走
 * 优先使用 insertText 以保留浏览器的撤销记录
 * @param {KeyboardEvent} event
 */
export const insertTabOnKeydown = (event) => {
  if (event.key !== "Tab" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;

  event.preventDefault();
  const textarea = event.target;
  if (!document.execCommand("insertText", false, "\t")) {
    textarea.setRangeText("\t", textarea.selectionStart, textarea.selectionEnd, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
};
