# 使用 Docker 在本地启动 PostgreSQL 18

本文介绍如何在本地使用 Docker 快速启动一个 **PostgreSQL 18** 实例，用于
OpenCowStudio 的本地开发。

应用**不会**从环境变量中读取数据库凭据。连接配置统一存放在一个 YAML 文件
`pg.config.yaml` 中（参见 `modules/base/src/index.ts`，该模块会在构建时将其
载入到仅服务端的 `runtimeConfig.pg`）。下面的示例使用了项目的默认值，开箱即用：

| 配置项             | 默认值               |
| ------------------ | -------------------- |
| host               | `localhost`          |
| port               | `5432`               |
| database           | `opencowstudio_dev`  |
| username           | `postgres`           |
| password           | `postgres`           |

## 前置条件

- 已安装并运行 Docker Engine（或 Docker Desktop）。
- 验证安装：

  ```bash
  docker --version
  docker info
  ```

## Docker Compose

在项目根目录创建一个 `docker-compose.yml`（或把该服务加入到已有的 compose
文件中）：

```yaml
services:
  postgres:
    image: postgres:18
    container_name: opencowstudio-pg
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: opencowstudio_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  pgdata:
```

启动：

```bash
docker compose up -d
```

命名卷 `pgdata` 会在容器重建时保留你的数据。停止并移除容器（保留数据卷）：

```bash
docker compose down
```

同时删除数据卷：

```bash
docker compose down -v
```

## 验证实例

确认容器健康运行：

```bash
docker ps --filter "name=opencowstudio-pg"
```

使用 `psql` 客户端连接（可从容器内或本地安装连接）：

```bash
# 进入容器内部
docker exec -it opencowstudio-pg psql -U postgres -d opencowstudio_dev

# 或从宿主机连接（需本地安装 psql）
psql "postgresql://postgres:postgres@localhost:5432/opencowstudio_dev"
```

列出数据库，确认 `opencowstudio_dev` 已存在：

```sql
\l
```

## 接入应用

实例运行后，在项目根目录的 `pg.config.yaml` 中配置连接。该文件已被
git 忽略；请自行创建（或从团队模板复制），并将 `master` / `slaves` 节点指向
运行中的容器：

```yaml
pool:
  max: 18
  min: 18
  idleTimeoutMillis: 600000
  maxLifetimeSeconds: 1800
databases:
  default:
    master:
      url: postgresql://localhost:5432/opencowstudio_dev
      username: postgres
      password: postgres
    slaves: []
```

像往常一样启动 Nuxt 应用 —— `pg` 数据源模块会在构建时加载 `pg.config.yaml`
并注入到仅服务端的运行时配置中，连接会被自动读取。

## 常用操作

停止容器：

```bash
docker stop opencowstudio-pg
```

再次启动：

```bash
docker start opencowstudio-pg
```

彻底移除容器（命名卷中的数据会保留，除非使用 `-v`）：

```bash
docker rm -f opencowstudio-pg
```

查看日志：

```bash
docker logs -f opencowstudio-pg
```

## 故障排查

- **端口 5432 被占用** —— 停止占用该端口的本地 Postgres 服务，或映射一个不同的
  宿主机端口（例如 `-p 5433:5432`），并相应更新 `pg.config.yaml` 中的 `url`。
- **连接被拒绝** —— 确认容器正在运行（`docker ps`），且 `pg.config.yaml` 中的
  主机/端口与发布的端口一致。
- **密码认证失败** —— 容器中设置的 `POSTGRES_PASSWORD` 必须与 `pg.config.yaml`
  中的 `password` 一致。
- **数据未持久化** —— 确保使用了数据卷或绑定挂载；否则在移除容器时所有数据都会
  丢失。
