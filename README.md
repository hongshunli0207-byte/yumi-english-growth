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


## v6 内容优化

- 学习页例句重做：每个词 3 个例句，按词义类别生成，避免大量重复模板。
- 中文释义补全：合并教材中文提示、旧版词库释义和补充词义表。
- 已加入错题本内容迁移：已有错词会自动更新为新版中文释义和例句。
- 课程顺序、每日错词规则、周六/周日规则、ElevenLabs 接入方式都不变。

优化前缺少中文提示词数：812
优化后仍需人工确认词数：579
总课程词条：1275
去重单词：1275


## v7 拼写与听写交互优化

- 双写法单词统一为美式拼写，只保留一个答案，例如 labor/labour → labor。
- 听写判断改为单一美式答案，不再接受 slash 双写法。
- 听写错误后不会出现“下一个”，必须改正确后才显示“下一个”。
- 听写页新增“上一个”按钮，防止孩子误触跳题。
- 学习页每个例句旁增加发音按钮，可单独播放例句。
- 课程、错题、周六/周日、ElevenLabs 真人发音结构保持不变。

本次替换双写法词条数量：11
