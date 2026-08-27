// app.js — Vue 根组件：全局 loading / 登录拦截 / 顶部栏 / 底部 TabBar / 下拉刷新 / 错误边界
(function () {
  var app = Vue.createApp({
    setup: function () {
      var view = Vue.ref('login');
      var title = Vue.ref('');
      var tab = Vue.ref('');
      var showTab = Vue.ref(false);
      var canBack = Vue.ref(false);
      var hideBar = Vue.ref(false);
      var query = Vue.ref({});
      var toastMsg = Vue.ref('');
      var toastVisible = Vue.ref(false);
      var loading = Vue.ref(false);
      var appError = Vue.ref({ show: false, msg: '' });
      var tabElevated = Vue.ref(false);
      var ptrPulling = Vue.ref(false);
      var ptrText = Vue.ref('\u4e0b\u62c9\u5237\u65b0');
      var barAction = Vue.ref({ show: false, text: '', handler: null });

      // 全局吐司（供 utils.toast 底层调用）
      window.__toastMsg = function (msg, duration) {
        toastMsg.value = msg;
        toastVisible.value = true;
        if (window.__toastTimer) clearTimeout(window.__toastTimer);
        window.__toastTimer = setTimeout(function () { toastVisible.value = false; }, duration || 1500);
      };

      window.__setLoading = function (v) { loading.value = !!v; };
      window.__setBarAction = function (text, handler) {
        barAction.value = { show: !!text, text: text || '', handler: handler || null };
      };

      // 路由解析与登录拦截（错误防护：route() 调用时 errorHandler 尚未注册）
      function route() {
        try {
          if (typeof Router === 'undefined' || !Router.parse) {
            console.error('[app init] Router 不存在，回退到 login');
            view.value = 'login';
            return;
          }
          var r = Router.parse();
          var isLogin = r && r.path === '/login';
          if (!isLogin && !Store.getToken()) {
            location.hash = '#/login';
            return;
          }
          var name = (Router.routes && Router.routes[r && r.path]) || (isLogin ? 'login' : 'home');
          view.value = name || 'login';
          title.value = (Router.titleOf && Router.titleOf(name)) || '';
          tab.value = (Router.tabOf && Router.tabOf(name)) || '';
          showTab.value = !!(Router.tabOf && Router.tabOf(name));
          canBack.value = !isLogin && r && r.path !== '/';
          hideBar.value = !!isLogin;
          var newQuery = {};
          if (r && r.query) Object.assign(newQuery, r.query);
          query.value = newQuery;
        } catch (err) {
          console.error('[app route error]', err);
          view.value = 'login';
        }
      }

      // 注册 errorHandler 要早于 route() 调用
      app.config.errorHandler = function (err, instance, info) {
        console.error('[app error]', err, info);
        appError.value = { show: true, msg: (err && (err.message || String(err))) || '\u9875\u9762\u51fa\u9519\u4e86' };
      };

      window.addEventListener('hashchange', route);
      if (!location.hash) location.hash = '#/';
      route();

      function goBack() {
        if (window.history.length > 1) window.history.back();
        else location.hash = '#/';
      }

      function onBarActionClick() {
        var h = barAction.value.handler;
        if (typeof h === 'function') h();
      }

      function onBodyScroll(e) {
        var el = e.target;
        tabElevated.value = el.scrollTop > 4;
      }

      // 下拉刷新
      var ptrStartY = 0;
      var ptrTouching = false;

      function onTouchStart(e) {
        var body = document.querySelector('.app-body');
        if (!body || body.scrollTop > 0) return;
        ptrStartY = e.touches[0].clientY;
        ptrTouching = true;
      }

      function onTouchMove(e) {
        if (!ptrTouching) return;
        var dy = e.touches[0].clientY - ptrStartY;
        if (dy > 60) {
          ptrPulling.value = true;
          ptrText.value = '\u91ca\u653e\u5237\u65b0';
        } else if (dy > 10) {
          ptrPulling.value = true;
          ptrText.value = '\u4e0b\u62c9\u5237\u65b0';
        } else {
          ptrPulling.value = false;
        }
      }

      function onTouchEnd() {
        if (ptrPulling.value) {
          ptrText.value = '\u5237\u65b0\u4e2d...';
          var fn = window.__ptrFn;
          Promise.resolve(fn ? fn() : null).catch(function () {}).then(function () {
            ptrPulling.value = false;
            ptrText.value = '\u4e0b\u62c9\u5237\u65b0';
          });
        }
        ptrStartY = 0;
        ptrTouching = false;
      }

      function reloadPage() { appError.value.show = false; location.reload(); }

      return {
        view: view, title: title, tab: tab, showTab: showTab,
        canBack: canBack, hideBar: hideBar, query: query,
        toastMsg: toastMsg, toastVisible: toastVisible,
        loading: loading, appError: appError,
        tabElevated: tabElevated, ptrPulling: ptrPulling, ptrText: ptrText,
        barAction: barAction,
        goBack: goBack, onBarActionClick: onBarActionClick,
        onBodyScroll: onBodyScroll,
        onTouchStart: onTouchStart, onTouchMove: onTouchMove, onTouchEnd: onTouchEnd,
        reloadPage: reloadPage
      };
    }
  });

  // 注册所有页面组件
  Object.keys(window.Pages || {}).forEach(function (name) {
    app.component(name, window.Pages[name]);
  });

  app.mount('#app');
})();
