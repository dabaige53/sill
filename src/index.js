const app = new AppController();
app.init();
if(window.__QG_LOCAL__)LocalSync.connect(app);
if(window.__QG_RUNTIME__)window.__quietGlass={app,store:Store,panels:Panels,esc};
