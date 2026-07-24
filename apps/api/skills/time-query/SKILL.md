---
name: time-query
description: 时区时间查询技巧：如何正确处理用户的时间、时区换算类问题
---

# 时区时间查询

处理用户的时间相关问题时，遵循以下规则：

## 规则

1. 用户未指定时区时，默认使用 Asia/Shanghai（北京时间）。
2. 用户提到城市名时，先映射到 IANA 时区，再查询。常见映射：
   - 北京/上海/深圳 → Asia/Shanghai
   - 东京 → Asia/Tokyo
   - 纽约 → America/New_York
   - 伦敦 → Europe/London
   - 洛杉矶/旧金山 → America/Los_Angeles
3. 涉及两地时差换算时，分别查询两个时区的当前时间再计算差值。
4. 永远调用工具获取真实时间，禁止凭训练记忆回答当前时间。

## 脚本

本技能附带 `get-current-time.js` 脚本，入参 `{ "timezone": "Asia/Shanghai" }`，
返回该时区的当前时间字符串。可通过 use_skill 的 runScripts 参数执行。
