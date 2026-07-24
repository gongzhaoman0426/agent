// 入参: input.timezone (IANA 时区，默认 Asia/Shanghai)
// 出参: result = { time, timezone }
const timezone = input.timezone || 'Asia/Shanghai';
const formatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: timezone,
  dateStyle: 'full',
  timeStyle: 'medium',
});
result = { time: formatter.format(new Date()), timezone };
