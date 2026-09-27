# 伊蕾娜桌宠 · AI Desktop Pet

Electron + Live2D 的桌面宠物：透明置顶窗口、视线跟随、拖拽缩放、点击互动、台词气泡（AI 聊天开发中）。

## 功能

- 🧙 Live2D 模型渲染（PIXI + pixi-live2d-display）：眨眼、视线跟随鼠标、头发物理
- 🖱️ 拖拽移动、点击弹跳 + 随机台词、空闲自言自语
- 🔍 Ctrl+滚轮缩放（50%~160%），托盘菜单（置顶 / 开机自启 / 大小 / 使用说明）
- 🩹 左下角贴图瑕疵遮罩（模型级瑕疵的通用兜底）
- 🚧 路线图见 [TASKS.md](./TASKS.md)：AI 对话、长短期记忆、弧形菜单

## 快速开始

```bash
npm install            # 安装 Electron（建议 npmmirror 源）
npm start              # 启动
```

## 素材与运行时（不随仓库分发，需自行放置）

因版权与许可限制，以下内容请自行获取后放入对应目录：

```
assets/model/LSS/          ← Live2D 模型文件夹（.moc3 + .model3.json + 贴图 + 物理）
                             模型入口固定为 assets/model/LSS/LSS.model3.json
                             （可替换为任意 Cubism 3/4/5 模型，改 renderer.js 中的路径）
vendor/pixi.min.js         ← PixiJS v7（MIT）
vendor/cubism4.min.js      ← pixi-live2d-display 0.4（MIT）
vendor/live2dcubismcore.min.js ← Cubism Core（Live2D 专有许可，需到官网同意协议后下载）
```

- PixiJS / pixi-live2d-display 可从 npm 或 jsdelivr 获取
- Cubism Core 请至 [Live2D 官方](https://www.live2d.com/en/sdk/download/) 下载（也可从 npm 镜像包 `live2dcubismcore` 获取，注意遵守许可）
- **请勿将版权角色的模型文件上传到公开仓库**

## 技术栈

Electron · PIXI 7 · pixi-live2d-display 0.4 · Live2D Cubism Core

## 开发须知

涉及窗口尺寸/拖拽的代码有几个已踩过的 DPI 坑（整数坐标、setBounds 钉宽高、缩放拟合系数只算一次），改动前建议先读 `src/main.js` 与 `src/renderer.js` 的注释。

## License

代码部分 MIT（见 LICENSE）。不含任何第三方角色素材。
