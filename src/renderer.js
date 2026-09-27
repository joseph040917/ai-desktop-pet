// 渲染层：Live2D 显示 + 视线跟随 + 拖拽 + 点击互动 + 空闲闲聊
(function () {
  var bubble = document.getElementById('bubble');
  var rebuildMaskFn = null; // 模型加载后由 .then() 里赋值，供弹跳帧同步遮罩

  // 与主进程一致的基准窗口尺寸
  var BASE_W = 380;
  var BASE_H = 560;

  // ---- 台词库 ----
  var CLICK_LINES = [
    '唔……怎么了？',
    '灰之魔女，参上。',
    '别摸我啦，头发会乱的。',
    '旅途的意义，大概就在于这些瞬间吧。',
    '你再点我，我就把你写进旅行日记里。',
    '今天的风，很适合出发呢。',
    '嗯？想听旅途的故事吗？',
    '我只是个路过的魔女而已~'
  ];
  var IDLE_LINES = [
    '……有点想念旅途了。',
    '风停了呢。',
    '你在忙什么呀？',
    '要不要休息一下？',
    '今天的云长得好奇怪。',
    '我在想下一站去哪里。',
    '偶尔停下来也不错。'
  ];

  function say(text, duration) {
    bubble.textContent = text;
    bubble.classList.add('show');
    clearTimeout(say._t);
    say._t = setTimeout(function () { bubble.classList.remove('show'); }, duration || 3200);
  }

  // ---- PIXI 舞台 ----
  if (typeof PIXI === 'undefined' || !PIXI.live2d) {
    say('渲染库加载失败', 99999);
    return;
  }
  var app = new PIXI.Application({ width: window.innerWidth, height: window.innerHeight, backgroundAlpha: 0, antialias: true });
  document.body.appendChild(app.view);
  app.view.style.cursor = 'default';

  var model = null;
  var bounce = 0; // 点击弹跳动画用

  PIXI.live2d.Live2DModel.from('../assets/model/LSS/LSS.model3.json').then(function (m) {
    model = m;
    app.stage.addChild(model);

    // ==== 道具开关体检与清理 ====
    // 该模型有 13 个换装/道具参数（眼镜/手+茶杯/表情/发型等），
    // 参数不在整数位时道具图层会缩一半、露出白色残片。先记录默认值，再全部归零。
    var PROP_IDS = ['Param', 'Param2', 'Param3', 'Param4', 'Param5', 'Param6', 'Param7', 'Param8', 'Param9', 'Param10', 'Param11', 'Param12', 'Param13'];
    var core = model.internalModel.coreModel;
    PROP_IDS.forEach(function (id) {
      try {
        var v = core.getParameterValueById(id);
        console.log('[params] ' + id + ' 默认值=' + v);
        core.setParameterValueById(id, 0);
      } catch (err) { console.log('[params] ' + id + ' 读取失败'); }
    });
    // 每帧钉死在 0，防止被内部更新重置回半开状态
    app.ticker.add(function () {
      for (var i = 0; i < PROP_IDS.length; i++) {
        core.setParameterValueById(PROP_IDS[i], 0);
      }
    });

    // 拟合系数 FIT：仅在加载瞬间（scale=1）计算一次，之后缩放只跟窗口尺寸线性相关。
    // 绝不在 resize 时重新读取 model.width 参与运算（那会形成"显示尺寸→缩放"的正反馈）。
    var FIT = null;
    // 左下角遮罩：挖掉贴图碎屑所在的空白角（跟随模型缩放移动）
    var maskG = new PIXI.Graphics();
    app.stage.addChild(maskG);
    function rebuildMask() {
      if (!model) return;
      maskG.clear();
      var W = model.width, H = model.height;
      var holeW = W * 0.24, holeH = H * 0.13;
      maskG.beginFill(0xffffff);
      maskG.drawRect(model.x, model.y, W, H);
      maskG.beginHole();
      maskG.drawRect(model.x - 4, model.y + H - holeH, holeW, holeH);
      maskG.endHole();
      maskG.endFill();
      model.mask = maskG;
    }
    rebuildMaskFn = rebuildMask;

    function layout() {
      // 画布跟随窗口（手动，不再用 resizeTo: window 的自动监听，避免反馈环）
      app.renderer.resize(window.innerWidth, window.innerHeight);
      if (FIT === null) {
        // 此刻 scale=1，量到的就是原始尺寸
        var natW = model.width, natH = model.height;
        FIT = Math.min(BASE_W / natW, BASE_H / natH) * 0.95;
        console.log('[layout] 采样原始尺寸: ' + natW + 'x' + natH + ' → FIT=' + FIT.toFixed(4));
        // 兜底：正常拟合系数在 0.02~2 之间；越界说明采样到了已缩放的错误尺寸
        if (!(FIT > 0.02 && FIT < 2)) {
          console.log('[layout] FIT 异常，启用兜底值 0.5');
          FIT = 0.5;
        }
      }
      var ratio = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);
      var s = FIT * ratio;
      model.scale.set(s);
      model.x = (window.innerWidth - model.width) / 2;
      model.y = window.innerHeight - model.height;
      model._baseScale = s;
      model._baseY = model.y;
      rebuildMask();
      console.log('[layout] win=' + window.innerWidth + 'x' + window.innerHeight + ' ratio=' + ratio.toFixed(3) + ' scale=' + s.toFixed(4) + ' 显示=' + Math.round(model.width) + 'x' + Math.round(model.height));
    }
    layout();
    window.addEventListener('resize', layout);

    // 视线跟随（拖拽中冻结：窗口移动会让 clientX 抖动，驱动视线会整只乱甩）
    window.addEventListener('pointermove', function (e) {
      if (dragging) {
        if (!lastSent || Math.abs(e.screenX - lastSent.x) + Math.abs(e.screenY - lastSent.y) >= 1) {
          lastSent = { x: e.screenX, y: e.screenY };
          window.pet.dragMove(e.screenX, e.screenY);
        }
      } else if (model) {
        model.focus(e.clientX, e.clientY);
      }
    });

    setTimeout(function () { say('灰之魔女，参上~'); }, 600);
    scheduleIdleTalk();
  });

  // 每帧：点击弹跳（弹跳时同步遮罩，保持挖角对齐）
  app.ticker.add(function () {
    if (!model || bounce <= 0) return;
    bounce -= 0.06;
    var k = Math.sin((1 - bounce) * Math.PI) * bounce * 0.25;
    model.scale.set(model._baseScale * (1 + k));
    model.y = model._baseY - k * 60;
    if (rebuildMaskFn) rebuildMaskFn();
  });

  // ---- 鼠标：拖拽 vs 点击 ----
  var dragging = false;
  var downPos = null;
  var lastSent = null;

  window.addEventListener('pointerdown', function (e) {
    downPos = { x: e.screenX, y: e.screenY, t: Date.now() };
    dragging = true;
    lastSent = null;
    try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
    window.pet.dragStart(e.screenX, e.screenY);
    app.view.style.cursor = 'grabbing';
  });

  window.addEventListener('pointerup', function (e) {
    app.view.style.cursor = 'default';
    if (dragging) window.pet.dragEnd();
    dragging = false;
    if (!downPos) return;
    var moved = Math.abs(e.screenX - downPos.x) + Math.abs(e.screenY - downPos.y);
    if (moved < 5) {
      // 判定为点击
      bounce = 1;
      say(CLICK_LINES[Math.floor(Math.random() * CLICK_LINES.length)]);
    }
    downPos = null;
  });

  // ---- Ctrl+滚轮缩放 ----
  var scaleState = 1.0;
  window.addEventListener('wheel', function (e) {
    if (!e.ctrlKey) return;
    e.preventDefault(); // 阻止 Chromium 页面缩放
    scaleState += (e.deltaY < 0 ? 0.1 : -0.1);
    scaleState = Math.min(1.6, Math.max(0.5, scaleState));
    window.pet.resize(scaleState);
    say('大小 ' + Math.round(scaleState * 100) + '%', 1200);
  }, { passive: false });

  // ---- 底部提示 8 秒后自动淡出（操作说明已移至托盘菜单「使用说明」）----
  setTimeout(function () {
    var hint = document.getElementById('hint');
    if (hint) hint.classList.add('hide');
  }, 8000);

  // ---- 空闲闲聊 ----
  function scheduleIdleTalk() {
    var wait = 45000 + Math.random() * 75000; // 45s ~ 2min
    setTimeout(function () {
      if (!bubble.classList.contains('show')) {
        say(IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)], 4000);
      }
      scheduleIdleTalk();
    }, wait);
  }
})();
