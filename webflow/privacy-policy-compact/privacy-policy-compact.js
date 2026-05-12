/* MMD Privacy Compact LV8 */
(function () {
  var root = document.querySelector('[data-mmd-privacy-cx]');
  if (!root) return;
  var links = root.querySelectorAll('.mmd-privacy-cx__nav a');
  links.forEach(function (link) {
    link.addEventListener('click', function (event) {
      var id = link.getAttribute('href');
      if (!id || id.charAt(0) !== '#') return;
      var target = document.querySelector(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();