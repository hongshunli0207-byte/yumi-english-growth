# Yumi 英语成长打卡 iPad PWA v3

本版修改：

- 课程顺序改为上传的《Spelling Bee 26周混编错峰教材》顺序。
- 课程开始日期固定为 2026-06-01 周一，因此 2026-06-04 会显示第 1 周周四。
- 周一到周五：每天 10 个新词，即 7 个基础词 + 3 个挑战词。
- 每天加入“昨天全部错词”，不再限制 2 个。
- 周六：听写本周 50 个新词。
- 周日：集中复盘本周错词。
- 已预置周一到周三错词到错题本：
  education, about, ability, kettle, rabbit, umpire, immersion, hamburger。
- 听写页仍然只保留发音、输入框和判分，不显示中文与例句。
- 学习页每个词保留 3 个例句。

解析课程天数：128 天。
去重单词数：1275 个。


## v4 发音优化

- 增加发音设置：美音 / 英音。
- 增加语速设置：慢速、标准偏慢、标准。
- 增加重复播放：1遍、2遍、3遍。
- 自动优先选择 iPad / Safari / Chrome 当前设备中更自然的英语声音。
- 仍然不接服务器，全部在浏览器本地完成。


## v5 ElevenLabs 真人发音版

### 需要在 Netlify 设置环境变量

在 Netlify 后台进入：

Site configuration → Environment variables

新增：

- ELEVENLABS_API_KEY：你的 ElevenLabs API Key
- ELEVENLABS_VOICE_ID：你选择的 voice id。可选，不填会使用 ElevenLabs 文档示例 voice id：JBFqnCBsd6RMkjVDRZzb
- ELEVENLABS_MODEL_ID：可选，默认 eleven_multilingual_v2

### 发音逻辑

- 默认使用 ElevenLabs 真人发音。
- 如果 ElevenLabs 请求失败，会自动退回 iPad/浏览器本机发音。
- API Key 只存在 Netlify Function 环境变量里，不会出现在前端网页代码。
- 函数路径：/.netlify/functions/tts

### 部署方式

这个版本包含 Netlify Function，不建议只用普通静态拖拽预览。
推荐把整个文件夹上传到 GitHub 后连接 Netlify，或使用 Netlify CLI 部署。
