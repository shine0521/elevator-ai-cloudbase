(function () {
  const app = Vue.createApp({
    setup() {
      const view = Vue.ref('login');
      const title = Vue.ref('');
      const tab = Vue.ref('');
      const showTab = Vue.ref(false);
      const canBack = Vue.ref(false);
      const hideBar = Vue.ref(false);
      const query = Vue.reactive({});
      const toast = Vue.reactive({ show: false, msg: '' });

      window.__toast = function (msg) {
        toast.msg = msg;
        toast.show = true;
        clearTimeout(window.__tt);
        window.__tt = setTimeout(function () { toast.show = false; }, 2000);
      };

      function route() {
        const r = Router.parse();
        const name = Router.map[r.path] || 'home';
        view.value = name;
        title.value = Router.titleOf[name] || '';
        tab.value = Router.tabOf[name] || '';
        showTab.value = !!Router.tabOf[name];
        canBack.value = r.path !== '/' && name !== 'login';
        hideBar.value = name === 'login';
        Object.keys(query).forEach(function (k) { delete query[k]; });
        Object.assign(query, r.query);
      }

      window.addEventListener('hashchange', route);
      route();

      function goBack() {
        if (window.history.length > 1) window.history.back();
        else location.hash = '#/';
      }

      return { view: view, title: title, tab: tab, showTab: showTab, canBack: canBack, hideBar: hideBar, query: query, toast: toast, goBack: goBack };
    }
  });

  // 注册所有页面组件
  Object.keys(window.Pages || {}).forEach(function (name) {
    app.component(name, window.Pages[name]);
  });

  app.mount('#app');
})();
