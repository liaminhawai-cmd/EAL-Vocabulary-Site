// Public-build privacy guard.
// The source app once contained optional account/cloud and email-request flows.
// Public publishing is local-only: prevent any mailto submission and keep the
// dormant Account entry out of normal navigation.
(() => {
  const style = document.createElement('style');
  style.textContent = 'a[href="#/account"]{display:none!important}';
  document.head.appendChild(style);

  document.addEventListener('click', (event) => {
    const button = event.target && event.target.closest ? event.target.closest('button') : null;
    if (!button) return;
    const label = (button.textContent || '').trim();
    if (/^Send request(?: to your teacher)?$/i.test(label)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.alert('This public version does not send student information. Show your request to your teacher instead.');
    }
  }, true);

  const nativeClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (typeof this.href === 'string' && this.href.toLowerCase().startsWith('mailto:')) {
      window.alert('This public version does not send student information.');
      return;
    }
    return nativeClick.call(this);
  };
})();
