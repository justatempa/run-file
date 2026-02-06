#!/bin/bash

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== PWT App Docker 启动脚本 ===${NC}\n"

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}错误: Docker 未运行，请先启动 Docker${NC}"
    exit 1
fi

# 检查 .env 文件
if [ ! -f .env ]; then
    echo -e "${YELLOW}未找到 .env 文件，正在生成...${NC}"

    # 从 .env.docker 复制
    if [ -f .env.docker ]; then
        cp .env.docker .env
        echo -e "${GREEN}✓ 已从 .env.docker 创建 .env 文件${NC}"
    elif [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}✓ 已从 .env.example 创建 .env 文件${NC}"
    else
        echo -e "${RED}错误: 未找到 .env.docker 或 .env.example${NC}"
        exit 1
    fi

    # 生成随机的 AUTH_SECRET
    if command -v openssl > /dev/null 2>&1; then
        AUTH_SECRET=$(openssl rand -base64 32)
        # 在 macOS 和 Linux 上使用不同的 sed 语法
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|AUTH_SECRET=.*|AUTH_SECRET=$AUTH_SECRET|g" .env
        else
            sed -i "s|AUTH_SECRET=.*|AUTH_SECRET=$AUTH_SECRET|g" .env
        fi
        echo -e "${GREEN}✓ 已生成随机 AUTH_SECRET${NC}"
    fi

    echo -e "\n${YELLOW}请编辑 .env 文件，填写以下配置：${NC}"
    echo "  - AUTH_DISCORD_ID"
    echo "  - AUTH_DISCORD_SECRET"
    echo "  - UPLOADTHING_TOKEN"
    echo ""
    read -p "按回车键继续，或按 Ctrl+C 取消..."
else
    echo -e "${GREEN}✓ 找到 .env 文件${NC}"
fi

# 创建数据目录
if [ ! -d ./data ]; then
    mkdir -p ./data
    echo -e "${GREEN}✓ 创建数据目录 ./data${NC}"
fi

# 检查是否需要重新构建
BUILD_FLAG=""
if [ "$1" == "--build" ] || [ "$1" == "-b" ]; then
    BUILD_FLAG="--build"
    echo -e "${YELLOW}将重新构建镜像...${NC}"
fi

# 启动容器
echo -e "\n${GREEN}正在启动容器...${NC}"
docker compose up -d $BUILD_FLAG

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}=== 启动成功！ ===${NC}"
    echo -e "应用地址: ${GREEN}http://localhost:13701${NC}"
    echo -e "\n常用命令:"
    echo "  查看日志: docker compose logs -f"
    echo "  停止应用: docker compose down"
    echo "  重启应用: docker compose restart"
    echo "  重新构建: ./start.sh --build"
else
    echo -e "\n${RED}启动失败，请查看错误信息${NC}"
    exit 1
fi
