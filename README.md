# 个人导航页

基于 Vue 3 + Vite 构建的私人导航页,部署在腾讯云 [EdgeOne Makers](https://cloud.tencent.com/product/1552/127365),数据通过 EdgeOne KV 存储,对标 mTab / Sun-Panel。

## 特性

- 书签管理(分组、拖拽排序、点击计数)
- 多搜索引擎切换(百度/Google/Bing/知乎/B站/GitHub,可自定义)
- 主题切换(深色/浅色/跟随系统)
- 背景自定义(纯色/渐变/图片)
- 单密码登录(Cookie + KV Token 鉴权)
- 图标自动获取(Google s2 / favicon.cccyun.cc / 站点 favicon 三级兜底)
- 数据导入导出(JSON 备份)

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Vite + TypeScript + vuedraggable |
| 后端 | EdgeOne Edge Functions(V8 运行时,非 Node.js) |
| 存储 | EdgeOne Makers KV(只能在 Edge Functions 中访问) |
| 部署 | GitHub 仓库关联 EdgeOne Makers,自动构建 |

## 项目结构

```
.
├── edge-functions/          # Edge Functions 后端(文件即路由)
│   ├── _lib/kv.js           # 共享工具(KV 操作、SHA-256、Cookie 解析等)
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
- 安装 EdgeOne CLI(用于本地调试 Edge Functions + KV):

```bash
npm install -g edgeone
edgeone login        # 选择 China,浏览器完成登录
```

### 2. 安装依赖

```bash
npm install
```

### 3. 开通 KV 并绑定命名空间

1. 进入 [EdgeOne Makers 控制台](https://console.cloud.tencent.com/edgeone/pages) -> 存储 -> KV 存储,申请开通账户
2. 创建一个命名空间(例如 `personal_nav`)
3. 创建一个 Makers 项目,在项目详情的「KV 存储」中绑定该命名空间,**变量名必须填 `NAV_KV`**(与代码中一致)
4. 关联本地项目到该 Makers 项目:

```bash
edgeone makers link    # 按提示选择项目
```

### 4. 启动本地调试

打开**两个终端**:

终端 A —— Edge Functions 后端(含 KV,端口 8088):
```bash
npm run dev:edge
# 等价于 edgeone makers dev
```

终端 B —— 前端 Vite(端口 5173,代理 /api 到 8088):
```bash
npm run dev
```

浏览器访问 http://localhost:5173 即可,首次访问会跳转到登录页。

### 5. 首次登录设置密码

由于 KV 中尚无密码,登录页第一次输入的密码会被设置为初始密码。后续可继续在 KV 控制台手动修改 `auth_password` 键值,或重新初始化。

## 部署到 EdgeOne Makers

### 方式一:GitHub 关联(推荐)

1. 将本项目推送到 GitHub 仓库
2. 进入 EdgeOne Makers 控制台 -> 创建项目 -> 导入 Git 仓库
3. 选择对应仓库,框架自动识别为 `vue`,构建命令 `npm run build`,输出目录 `dist`
4. 点击「开始部署」,等待构建完成
5. 部署成功后,在项目详情 -> KV 存储,绑定命名空间,变量名填 `NAV_KV`
6. (可选)在项目详情 -> 环境变量中,配置 `INIT_PASSWORD`(可选,代码已支持首次登录自动设置)
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
| GET | /api/health | 健康检查 / KV 绑定状态 | ✕ |
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

## KV 数据模型

| Key | 类型 | 说明 |
|---|---|---|
| `config` | JSON | 全局配置(标题/背景/主题/搜索引擎等) |
| `auth_password` | JSON | 登录密码的 SHA-256 哈希 |
| `token_<32hex>` | JSON | 登录 token(7 天 TTL) |
| `groups_index` | JSON Array | 分组索引 `[{id,name,sort}]` |
| `group_<id>` | JSON | 单个分组对象,含 bookmarks 数组 |

## 关键限制注意

- **KV Key 字符**:仅数字、字母、下划线,所有 key 已遵循
- **KV Value**:单值 ≤ 25MB(个人书签远不到)
- **Edge Function body**:≤ 1MB(导入放宽到 2MB)
- **Edge Function CPU 时间**:200ms(不含 I/O 等待)
- **KV 最终一致性**:其他边缘节点最长 60s 同步,个人用基本无感

## 故障排查

### 登录后立刻又跳回登录页
- 检查 Cookie 是否被浏览器拦截(HttpOnly + SameSite=Strict 在某些跨域场景下需要 SameSite=Lax)
- 检查 KV 是否绑定成功:访问 `/api/health`,确认 `kvBound: true`

### 跨分组拖拽后书签丢失
- 代码已遍历保存所有受影响分组,但仍可能因并发写入被覆盖,刷新页面即可恢复

### 图标显示空白
- 部分网站无 favicon,会显示书签名称首字母占位,属正常现象
- 国内访问 Google s2 服务可能慢,代码已配置多级兜底
