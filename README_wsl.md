# WSL Development

> __NOTICE__: For Window user only
 
## Prerequisites

1. Install WSL2 (suggestion distro: Ubuntu 22.04 LTS) on Window, follow this [instruction](https://learn.microsoft.com/en-us/windows/wsl/install)

2. Install Redis in WSL, follow this [instruction](https://redis.io/docs/latest/operate/oss_and_stack/install/install-redis/install-redis-on-linux/)

3. Install Tesseract in WSL, follow this [instruction](https://tesseract-ocr.github.io/tessdoc/Installation.html)

4. Install Nodejs in WSL, follow this [instruction](https://nodejs.org/en/download/package-manager)

## Development

1. Clone the repository

```bash
git clone https://github.com/hairbui76/ocr-translation.git
```

2. Start redis server, open wsl then run command

```bash
sudo systemctl start redis-server
```

3. Change directory to cloned repo, install dependency

```bash
cd ocr-translation && npm i
```

4. Run the application

```bash
npm run dev
```

