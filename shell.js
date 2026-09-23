/* ═══════════════════════════════════════════
   Strandply ERP — Shared Shell JS
   Include at bottom of every module <body>
═══════════════════════════════════════════ */
(function(){
  'use strict';
  const KEY='strandply-sidebar-collapsed';

  /* ── Sidebar collapse ── */
  function initSidebar(){
    const sb=document.getElementById('sidebar');
    const tog=document.getElementById('sidebarToggle');
    if(!sb||!tog) return;
    if(localStorage.getItem(KEY)==='1') sb.classList.add('collapsed');
    tog.addEventListener('click',()=>{
      const c=sb.classList.toggle('collapsed');
      localStorage.setItem(KEY,c?'1':'0');
    });
  }

  /* ── Mobile overlay ── */
  function initMobile(){
    const sb=document.getElementById('sidebar');
    const overlay=document.getElementById('mob-overlay');
    const hamburger=document.getElementById('tb-hamburger');
    if(!sb) return;
    if(hamburger) hamburger.addEventListener('click',()=>{sb.classList.add('mob-open');if(overlay)overlay.classList.add('open')});
    if(overlay) overlay.addEventListener('click',()=>{sb.classList.remove('mob-open');overlay.classList.remove('open')});
  }

  /* ── Active nav from URL ── */
  function initActiveNav(){
    const cur=location.pathname.split('/').pop()||'index.html';
    document.querySelectorAll('.navlink[href],.navlink[data-href]').forEach(el=>{
      const href=el.getAttribute('href')||el.getAttribute('data-href')||'';
      if(href&&href.includes(cur)) el.classList.add('active');
    });
  }

  /* ── Topbar user info from session ── */
  function initTopbarUser(){
    try{
      const raw=localStorage.getItem('stp_session');
      if(!raw) return;
      const u=JSON.parse(raw);
      const av=document.getElementById('tb-av');
      const nm=document.getElementById('tb-nm');
      const rl=document.getElementById('tb-rl');
      const sbAv=document.getElementById('sb-av');
      const sbNm=document.getElementById('sb-name');
      const sbRl=document.getElementById('sb-role');
      if(av&&u.avatar){av.textContent=u.avatar;av.style.background=u.color||'#D71920'}
      if(nm&&u.name) nm.textContent=u.name;
      if(rl&&u.roleLabel) rl.textContent=u.roleLabel;
      if(sbAv&&u.avatar){sbAv.textContent=u.avatar;sbAv.style.background=u.color||'#D71920'}
      if(sbNm&&u.name) sbNm.textContent=u.name;
      if(sbRl&&u.roleLabel) sbRl.textContent=u.roleLabel;
    }catch(e){}
  }

  /* ── Standard Home / Dashboard Button Injector ── */
  function injectHomeButtons(){
    const path = location.pathname;
    const isRoot = (path === '/' || path === '/index.html' || path.endsWith('/index.html') && !path.includes('/') || path.endsWith('/Strandply-Marketing-CRM.html')) && !path.includes('/vendor/') && !path.includes('/production/') && !path.includes('/dwpas/') && !path.includes('/dispatch/') && !path.includes('/reports/') && !path.includes('/stores/') && !path.includes('/purchase/') && !path.includes('/quality/') && !path.includes('/crm/') && !path.includes('/transport/') && !path.includes('/accounts/') && !path.includes('/hr/') && !path.includes('/maintenance/') && !path.includes('/safety/');
    
    if(isRoot) return;

    const targetHref = path.includes('/') ? '/index.html' : './index.html';

    // 1. Sidebar Nav Injection
    const sidebarNavTargets = [
      '#sidebar .menu', '#sidebar nav', '#sidebar .nav-list',
      '#sidebar .sidebar-nav', '#sidebar .sb-menu', '#sidebar ul',
      'nav#sidebar', 'aside#sidebar', '#sidebar'
    ];
    for(let i = 0; i < sidebarNavTargets.length; i++){
      const el = document.querySelector(sidebarNavTargets[i]);
      if(el && !el.querySelector('.std-home-btn') && !el.querySelector('.shell-back-btn') && !el.querySelector('[data-portal-back]')){
        const btn = document.createElement('a');
        btn.className = 'std-home-btn';
        btn.href = targetHref;
        btn.title = 'Return to Portal Home Dashboard';
        btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> <span>Home / Dashboard</span>`;
        const brandHeader = el.querySelector('.brand-header, .sidebar-top, .sidebar-head, .brand, .sb-brand');
        if(brandHeader && brandHeader.nextSibling){
          el.insertBefore(btn, brandHeader.nextSibling);
        } else {
          el.insertBefore(btn, el.firstChild);
        }
        break;
      }
    }

    // 2. Topbar Injection
    const topbarRight = document.querySelector('#topbar-right') || document.querySelector('.tb-actions') || document.querySelector('#shell-topbar');
    if(topbarRight && !document.querySelector('.std-home-topbar-btn') && !topbarRight.querySelector('.hbtn')){
      const btn = document.createElement('a');
      btn.className = 'std-home-topbar-btn';
      btn.href = targetHref;
      btn.title = 'Home Dashboard';
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> <span>Home</span>`;
      topbarRight.insertBefore(btn, topbarRight.firstChild);
    }
  }

  /* ── Back to portal link ── */
  function initPortalLink(){
    document.querySelectorAll('[data-portal-back]').forEach(el=>{
      el.addEventListener('click',()=>window.location.href='../index.html');
    });
  }

  /* ── Toast helper ── */
  window.shellToast=function(msg,type){
    let tw=document.getElementById('toast-wrap');
    if(!tw){tw=document.createElement('div');tw.className='toast-wrap';tw.id='toast-wrap';document.body.appendChild(tw)}
    const t=document.createElement('div');
    t.className='toast'+(type?' '+type:'');t.textContent=msg;tw.appendChild(t);
    setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),300)},2800);
  };

  /* ── Init ── */
  document.addEventListener('DOMContentLoaded',()=>{
    initSidebar();
    initMobile();
    initActiveNav();
    initTopbarUser();
    initPortalLink();
    injectHomeButtons();
  });
})();
