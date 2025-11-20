# Stage 1: Build stage - where we install dependencies
FROM python:3.12-bookworm AS builder

# Install build tools needed for some python packages
RUN apt-get update && apt-get install -y gcc g++ 

WORKDIR /app

# Copy only the requirements file to leverage Docker cache
COPY api/requirements.txt requirements.txt

# 将依赖打包成 wheel，加速下一阶段的安装
RUN pip wheel --no-cache-dir --wheel-dir /app/wheels -r requirements.txt


# Stage 2: Production stage - a lean final image
FROM python:3.12-bookworm

WORKDIR /app

# Create a non-privileged user for security
RUN addgroup --system app && adduser --system --group app

# Copy installed dependencies from the builder stage
COPY --from=builder /app/wheels /wheels
COPY --from=builder /app/requirements.txt .
RUN pip install --no-cache-dir /wheels/*

# Copy the application code
COPY api .

# Create necessary directories (包括容器内的共享挂载目录) and set ownership
RUN mkdir -p temp_files exports data logs /app/data/duckdb /app/data/uploads /app/server_mounts /config && \
    chown -R app:app /app /config

# Set environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
# 默认挂载目录（可在 docker-compose 中覆盖）Default server-mounted data directory
ENV SERVER_DATA_ROOT=/app/server_mounts

# Switch to the non-privileged user
USER app

# Expose the port
EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# The command to run the application in production
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
