// navigation.js
// إدارة مكدس الصفحات (nav_stack) و زر الرجوع الموحد
(function(){
  const current = window.location.pathname.split('/').pop();
  try {
    const stack = JSON.parse(sessionStorage.getItem('nav_stack')||'[]');
    if(stack[stack.length-1] !== current){
      stack.push(current);
      sessionStorage.setItem('nav_stack', JSON.stringify(stack));
    }
  } catch(_){}

  function goBack(){
    try {
      const stack = JSON.parse(sessionStorage.getItem('nav_stack')||'[]');
      if(!Array.isArray(stack) || stack.length<=1){ window.location.href='index.html'; return; }
      stack.pop(); // ازل الصفحة الحالية
      const target = stack[stack.length-1];
      sessionStorage.setItem('nav_stack', JSON.stringify(stack));
      window.location.href = target || 'index.html';
    } catch(_){ window.location.href='index.html'; }
  }

  window.appNav = { goBack };

  const backBtn = document.getElementById('backBtn');
  if(backBtn){ backBtn.addEventListener('click', goBack); }
})();