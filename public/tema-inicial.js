// Anti-FOUC: aplica .dark/.light no <html> antes da primeira renderização.
// Ficheiro externo (não inline) para a CSP poder usar script-src 'self'.
(function () {
  try {
    var t = localStorage.getItem('encivil-theme')
    if (t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches))
      document.documentElement.classList.add('dark')
    else if (t === 'light')
      document.documentElement.classList.add('light')
  } catch (e) {}
})()
