# 个人导航页

基于 Vue 3 + Vite 构建的私人导航页,部署在腾讯云 [EdgeOne Makers](https://cloud.tencent.com/product/1552/127365),数据通过 EdgeOne **Blob 存储**(`@edgeone/pages-blob` SDK)持久化,对标 mTab / Sun-Panel。

## 特性

- 书签管理(分组、拖拽排序、点击计数)
- 多搜索引擎切换(百度/Google/Bing/知乎/B站/GitHub,可自定义)
- 主题切换(深色/浅色/跟随系统)
- 背景自定义(纯色/渐变/图片)
- 单密码登录(Cookie + Token 鉴权,强一致校验)
- 图标自动获取(Google s2 / favicon.cccyun.cc / 站点 favicon 三级兜底)
- 数据导入导出(JSON 备份)

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Vite + TypeScript + vuedraggable |
| 后端 | EdgeOne Edge Functions(V8 运行时,非 Node.js) |
| 存储 | EdgeOne Makers **Blob 存储**(`@edgeone/pages-blob` SDK) |
| 部署 | GitHub 仓库关联 EdgeOne Makers,自动构建 |

## 为何选 Blob 而非 KV?

| 项 | KV | Blob(本项目使用) |
|---|---|---|
| 开通方式 | 需企业版套餐申请,内测阶段 | **免费版即可,无需开通申请** |
| 控制台绑定 | 必须手动绑定命名空间到项目 | **首次调用自动创建命名空间,无需绑定** |
| 一致性 | 最终一致(其他节点 60s 同步) | **支持强一致模式(consistency: "strong")** |
| Key 限制 | 仅数字/字母/下划线 | 任意字符(支持目录式 `/`) |
| SDK | V8 全局变量,无 npm 包 | npm 包 `@edgeone/pages-blob`,可显式 import |

## 项目结构

```
.
├── edge-functions/          # Edge Functions 后端(文件即路由)
│   ├── _lib/kv.js           # 共享工具(Blob 适配层,接口与 KV 兼容)
│   ├── _middleware.js       # 全局中间件(鉴权)
│   └── api/
│       ├── auth/{login,logout,check}.js
│       ├── groups/
│       │   ├── index.js             # GET 列出/POST 新建
│       │   ├── [id].js              # PUT 更新/DELETE 删除
│       │   └── [id]/bookmarks.js   # POST 添加/PUT 全量替换
│       ├── config.js               # GET/PUT 全局配置
│       ├── backup.js               # GET 导出/POST 导入
│       └── health.js               # 健康检查
├── src/                     # 前端源码
├── public/                 # 静态资源
├── edgeone.json             # Makers 配置
└── vite.config.ts
```

## 本地开发

### 1. 准备环境

- Node.js 18+
- 安装 EdgeOne CLI(用于本地调试 Edge Functions + Blob):

```bash
npm install -g edgeone
edgeone login        # 选择 China,浏览器完成登录
```

### 2. 安装依赖

```bash
npm install
```

依赖会自动装上 `@edgeone/pages-blob`(后端存储 SDK)。

### 3. 关联 Makers 项目

> Blob 不需要在控制台预先创建命名空间,首次代码调用 `getStore("nav_data")` 时会自动创建。但本地调试仍需关联到某个 Makers 项目,以获取鉴权上下文。

1. 在 [EdgeOne Makers 控制台](https://console.cloud.tencent.com/edgeone/pages) 创建一个空项目(可先用任意模板占位,后续会用 Git 仓库覆盖)
2. 关联本地项目到该 Makers 项目:

```bash
edgeone makers link    # 按提示选择项目
```

### 4. 启动本地调试

打开**两个终端**:

终端 A —— Edge Functions 后端(含 Blob,端口 8088):
```bash
npm run dev:edge
# 等价于 edgeone makers dev
```

终端 B —— 前端 Vite(端口 5173,代理 /api 到 8088):
```bash
npm run dev
```

浏览器访问 http://localhost:5173,首次访问会跳转到登录页。

### 5. 首次登录设置密码

由于 Blob 中尚无密码,登录页第一次输入的密码会被设置为初始密码。

## 部署到 EdgeOne Makers

### 方式一:GitHub 关联(推荐)

1. 将本项目推送到 GitHub 仓库
2. 进入 EdgeOne Makers 控制台 -> 创建项目 -> 导入 Git 仓库
3. 选择对应仓库,框架自动识别为 `vue`,构建命令 `npm run build`,输出目录 `dist`
4. 点击「开始部署」,等待构建完成
5. **Blob 无需任何额外配置!** 部署后访问站点,首次代码调用 `getStore("nav_data")` 时会自动创建命名空间
6. (可选)在 Makers 控制台 -> 存储 -> Blob 中,可只读浏览已创建的命名空间和对象
7. 后续 `git push` 即可触发自动部署

### 方式二:CLI 直接上传

```bash
npm run build
edgeone makers deploy
```

## API 一览

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| POST | /api/auth/login | 登录 / 首次设置密码 | ✕ |
| POST | /api/auth/logout | 退出 | ✓ |
| GET | /api/auth/check | 检查登录态 | ✕ |
| GET | /api/health | 健康检查 / Blob 就绪状态 | ✕ |
| GET | /api/config | 读取全局配置 | ✓ |
| PUT | /api/config | 更新全局配置 | ✓ |
| GET | /api/groups | 获取所有分组及书签 | ✓ |
| POST | /api/groups | 新建分组 | ✓ |
| PUT | /api/groups/:id | 更新分组(重命名/排序) | ✓ |
| DELETE | /api/groups/:id | 删除分组(含书签) | ✓ |
| POST | /api/groups/:id/bookmarks | 添加书签到分组 | ✓ |
| PUT | /api/groups/:id/bookmarks | 全量替换分组书签数组(用于排序、修改) | ✓ |
| GET | /api/backup | 导出全部数据 JSON | ✓ |
| POST | /api/backup | 导入 JSON 覆盖现有数据 | ✓ |

## Blob 数据模型

命名空间名:`nav_data`(在 `edge-functions/_lib/kv.js` 的 `STORE_NAME` 常量中定义,首次调用时自动创建)

| Key | 类型 | 说明 |
|---|---|---|
| `config` | JSON 字符串 | 全局配置(标题/背景/主题/搜索引擎等) |
| `auth_password` | JSON 字符串 | 登录密码的 SHA-256 哈希 |
| `token_<32hex>` | JSON 字符串 | 登录 token(7 天 TTL) |
| `groups_index` | JSON 字符串 | 分组索引 `[{id,name,sort}]` |
| `group_<id>` | JSON 字符串 | 单个分组对象,含 bookmarks 数组 |

所有读写均使用 `consistency: "strong"` 强一致模式,确保登录 token 校验、密码修改等立即生效。

## 关键限制注意

- **Blob 免费版容量**:单账户 1GB(个人书签远不到)
- **Edge Function body**:≤ 1MB(导入放宽到 2MB)
- **Edge Function CPU 时间**:200ms(不含 I/O 等待)
- **强一致模式**:跳过边缘缓存直读主存储,耗时略高于最终一致,但个人导航页低频访问可接受
- **Edge Functions 是 V8 运行时,非 Node.js**:不可使用 fs/path/Buffer/process 等 Node 内置模块,但 `@edgeone/pages-blob` SDK 已为该运行时适配

## 故障排查

### 登录后立刻又跳回登录页
- 检查 Cookie 是否被浏览器拦截(HttpOnly + SameSite=Strict 在某些跨域场景下需要 SameSite=Lax)
- 检查 Blob 是否就绪:访问 `/api/health`,确认 `storageReady: true`、`storageType: "blob"`

### 部署后访问 /api/health 返回 `storageReady: false`
- 检查 `package.json` 的 `dependencies` 是否包含 `@edgeone/pages-blob`
- 检查 Makers 构建日志是否提示依赖安装失败
- 检查 `edge-functions/_lib/kv.js` 第 10 行 `import { getStore } from '@edgeone/pages-blob'` 是否被正确解析

### 跨分组拖拽后书签丢失
- 代码已遍历保存所有受影响分组,但仍可能因并发写入被覆盖,刷新页面即可恢复

### 图标显示空白
- 部分网站无 favicon,会显示书签名称首字母占位,属正常现象
- 国内访问 Google s2 服务可能慢,代码已配置多级兜底
