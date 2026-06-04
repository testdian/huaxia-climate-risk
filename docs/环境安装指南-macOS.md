# 环境安装指南（macOS）

本项目需要：**Node.js**、**Java 17**、**Maven**、**MySQL**（可用 Docker，也可用内置 H2 开发库跳过 Docker）。

---

## 一、检查当前环境

在终端执行：

```bash
node -v    # 建议 v18+
npm -v
java -version
mvn -version
docker -version
```

你当前情况（典型）：
- Node：已有（nvm 安装的 v18 即可）
- Java / Maven / Docker：需安装

---

## 二、推荐方式：先装 Homebrew，再一键装依赖

### 1. 安装 Homebrew

打开「终端」，执行（来自 https://brew.sh ）：

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

安装完成后，按终端提示把 `brew` 加入 PATH（Apple Silicon 常见为）：

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### 2. 安装 Java 17、Maven、Docker（可选）

```bash
brew install openjdk@17 maven
brew install --cask docker
```

配置 Java 环境变量（Intel / Apple Silicon 路径可能不同，以 `brew info openjdk@17` 提示为准）：

```bash
echo 'export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"' >> ~/.zshrc
echo 'export JAVA_HOME="/opt/homebrew/opt/openjdk@17"' >> ~/.zshrc
source ~/.zshrc
```

验证：

```bash
java -version   # 应显示 17.x
mvn -version
```

### 3. 启动 Docker Desktop

- 从「应用程序」打开 **Docker**
- 等菜单栏鲸鱼图标就绪后，再执行 `docker compose up -d`

---

## 三、不装 Homebrew 的替代方式

### Java 17

1. 打开 https://adoptium.net/zh-CN/temurin/releases/?version=17  
2. 下载 macOS **.pkg** 并安装  
3. 验证：`/usr/libexec/java_home -V` 和 `java -version`

### Maven

1. 打开 https://maven.apache.org/download.cgi  
2. 下载 `apache-maven-3.9.x-bin.tar.gz`，解压到例如 `~/tools/apache-maven-3.9.9`  
3. 在 `~/.zshrc` 增加：

```bash
export M2_HOME=~/tools/apache-maven-3.9.9
export PATH=$M2_HOME/bin:$PATH
```

### Docker Desktop

1. 打开 https://www.docker.com/products/docker-desktop/  
2. 下载 Mac 版并安装  

---

## 四、不装 Docker：用 H2 内存库开发（推荐先跑通）

已提供 `dev` 配置，**无需 MySQL / Docker**：

```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

此时数据在内存中，重启后数据会清空，仅适合本地演示。

---

## 五、启动项目

### 方式 A：完整环境（MySQL + Docker）

```bash
# 1. 数据库
cd "/Users/fangdanyang/Desktop/HUAXIA BANK-CLIMATE RISK/climate-risk-stress-test"
docker compose up -d

# 2. 后端
cd backend
mvn spring-boot:run

# 3. 前端（新开一个终端）
cd frontend
npm install
npm run dev
```

### 方式 B：仅 Java + Node（无 Docker）

```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev

cd frontend
npm install
npm run dev
```

---

## 六、访问地址

| 服务 | 地址 |
|------|------|
| 前端页面 | http://localhost:5173 |
| 后端 API | http://localhost:8080/api/tasks |

---

## 七、常见问题

**Q：`command not found: mvn`**  
→ 未安装 Maven 或未配置 PATH，见上文第二节或第三节。

**Q：`Unable to locate a Java Runtime`**  
→ 未安装 JDK 17 或未设置 `JAVA_HOME`。

**Q：`command not found: docker`**  
→ 未安装 Docker Desktop，或改用 `-Dspring-boot.run.profiles=dev`。

**Q：前端能开，接口报错**  
→ 先确认后端已启动，浏览器访问 http://localhost:8080/api/tasks 应有 JSON 返回。

**Q：nvm 下找不到 node**  
→ 新开终端前执行：`source ~/.nvm/nvm.sh` 或 `nvm use 18`。
