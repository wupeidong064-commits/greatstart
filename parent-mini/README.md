# 蜂鸣家长小程序（独立原生工程）

此目录是可导入微信开发者工具的家长专用原生小程序，包含 JS / WXML / WXSS / JSON；不依赖 H5 web-view，原独立旧版小程序已于 2026-11-19 随旧课务站归档。

## 范围

- 家长手机号或邮箱 + 密码登录；不使用验证码登录、不调用微信手机号授权。员工登录结果会被客户端拒绝，后端仍必须校验 parent 角色与孩子归属。
- 多孩子切换、剩余/已购/已消耗课时。字段缺失显示“待同步”，不生成假0。
- 近期45天课程与取消/调课状态，分页加载；具体变更以服务器课表及通知为准，不臆造原时间。
- 扣课、增加/返还和退费课时明细；`add` 且 `reversalOfId` 存在时显示“更正返还”；缺细分类的历史 `add` 标为“增加 / 返还”，不把返还错写成买课，也不把购课或赠课全部叫返还。
- 站内通知；独立失败提示与重试，下拉刷新。没有微信订阅消息、后台推送或已读回执。
- 只访问 `/auth/login`、`/auth/login-phone`、`/parent/*`，无内部经营/老师/销售/财务管理入口。

## 导入与配置

1. 微信开发者工具 → 导入项目，选择 **本目录 `greatstart/parent-mini`**。
2. 当前 `project.config.json` 的 `touristappid` 仅供开发导入；实际联调、体验版和发布使用机构自己的小程序 AppID，并按平台要求完成主体、类目、隐私及版本审核。
3. 编辑 `config.js` 的 `apiBaseUrl`，填写实际部署的 **HTTPS API 完整前缀，含 `/api`**。此项默认留空，空值或 HTTP 地址会直接提示配置错误，没有默认假域名或自动降级。
4. 微信公众平台 → 开发管理 → 开发设置 → 服务器域名，把该 HTTPS 后端的 **域名部分（不含 `/api` 路径）**加入 request 合法域名，配置有效 TLS 证书；发布保持域名校验开启。开发者工具项目配置已 `urlCheck: true`。
5. 后端为家长创建账号，并由机构管理端明确绑定孩子（`ParentStudentLink`），正确分配机构/校区；仅手机号相同并不会自动授予访问。使用机构提供的密码登录；共用手机号改用唯一邮箱。不是公开注册入口。

不需要 npm 构建。测试目录在上传排除列表内，不包含生产配置或账号。AppID、真实服务器、账号均需用户/机构提供；本任务没有购买、部署域名或发布。

## API 契约

响应信封必须为 `{ success: true, data: ... }`；401 清理会话返回登录；403 和网络错误显示明确提示，不当作空数据。

| 方法与路径（相对 apiBaseUrl） | 请求/数据 |
| --- | --- |
| POST `/auth/login` | `{ email, password }` → `{ token, user: { id,name,role } }`；只接受 role=parent |
| POST `/auth/login-phone` | `{ phone, password }`，同上 |
| GET `/parent/students` | `data` 数组：`id,name,remainingLessons,purchasedLessons,consumedLessons`；应保留暂未报名的关联孩子 |
| GET `/parent/schedules/:studentId` | `page,pageSize,endDate`；`data` 数组及 `pagination: {page,totalPages}`；行包含 `id,startTime,endTime,status,class:{name},teacher:{name},campus:{name},classroom` |
| GET `/parent/lesson-logs/:studentId` | `data` 数组：`id,type,lessons,businessDate,createdAt,reversalOfId,scheduleId`，同样提供分页 |
| GET `/parent/notifications/:studentId` | `data` 数组：`id,title,body,occurredAt`，同样提供分页 |

时间戳按上海时间显示；业务日期原样显示。请求只带服务端签发的 Bearer token，不由客户端指定机构/校区。后端保证每一个 studentId 通过显式家长绑定、机构、校区校验。余额不是由本地明细累加推算。

会话仅本地保存 token 与最小家长资料，密码不持久化；退出清理会话及页面数据。切换孩子后旧请求结果丢弃，旧登录401不会清除新登录。

## 已执行验证

```sh
node parent-mini/tests/verify.cjs
node parent-mini/tests/real-integration.cjs
```

静态验证：页面清单及四类原生文件存在、JSON/JS语法、WXML 标签结构（为 XML 校验补测试命名空间，不改运行时）、仅家长入口、HTTPS 空配置防护。

模拟 wx 交互：非家长拒绝、手机号密码登录、重复提交保护、不保存密码、多孩子切换、未知余额不假0、课表取消状态/上海时间、扣返展示/通知展示、切换孩子的并发旧响应丢弃、网络失败与会话过期/新旧登录隔离。

测试使用的 `fixture.invalid` 仅存在于 mock 测试脚本，并且测试目录不上传；正式配置保持空白待填真实服务。

**未执行微信开发者工具编译、微信模拟器渲染、真机联调或提审**。Node 模拟和 XML 静态检查不等于微信 WXML 编译通过或真机验收。正式交付仍需真实 AppID、HTTPS request 合法域名、测试家长与关联孩子、iOS/Android 实测，以及弱网/过期/多孩子切换验收。

若后续开通微信订阅消息，另需对应服务类目与模板、用户主动授权、服务端 OpenID 绑定和发送能力。本版本不请求订阅权限，也不声称会自动推送。


## 2026-11-13 作废流水补修

`void`课时流水现显示“成单作废扣回”及负号；格式化与首页JS数据绑定回归通过。本轮已用安装版微信开发者工具内置`wcc`/`wcsc`编译两页WXML及三份WXSS，并通过JS语法和既有模拟回归，覆盖上文历史“未执行编译”的边界；仍未运行IDE模拟器、微信真机或上传提审。证据见[五项遗留修复](../docs/acceptance/2026-11-13-five-review-fixes/README.md)。

## 真实后端契约集成（已执行）

`tests/real-integration.cjs` 使用本机 PostgreSQL 新建 `parent_mini_test_<时间>`，执行当前所有迁移、启动独立3198后端。运行真实小程序登录及首页 JS，模拟 `wx.request` 把请求转发给本机真实HTTP；不访问微信或外网，配置文件仍为空。结束关闭后端并删除临时库。

真实认证与数据库已通过：手机号密码家长登录；经理账号被客户端拒绝；只显示明确绑定的两个孩子，同手机号未绑定孩子API403；余额0仍显示0；历史扣课−1及签到更正返还+1显示“更正返还”；近期课表排除已完成过去课程、保留取消/调课；课时明细20→25、通知20→26（含数据库生成的课程通知）；无报名孩子仍有自己的余额/退费明细/站内通知；延迟旧孩子真实HTTP响应不覆盖新孩子；退出清空私有状态。

证据：`tests/integration-result.json` 记录PASS与请求路径/分页，不记录密码/token。适配修复包括：所有明细/通知分页、课表显式startDate、后台嵌套error.message提示、reversalOfId语义。

这仍是原生JS对真实HTTP的自动集成，不是微信开发者工具编译、微信模拟器或真机验收。
