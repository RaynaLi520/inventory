JA 成衣库存中台

线上地址：
部署完成后由 Vercel 生成

本地打开方式：
1. 双击 D:\henan-inventory\启动成衣库存平台.bat
2. 或直接打开 D:\henan-inventory\index.html

项目说明：
- 默认入口 index.html 是成衣库存 MVP，用 SKU 管理颜色/尺码变体、仓库与门店库存、出入库流水和渠道配额。
- 当前库存 MVP 使用浏览器本机存储，可直接体验搜索筛选、低库存预警、快速出入库、新增 SKU 和 CSV 导出。
- 原面料填报平台完整保留在 fabric.html，用于记录面料、供应商报价、图片和图片备注。
- inventory-schema.sql 是后续接入 Supabase 的规范化库存结构，请先执行 supabase-schema.sql，再执行该文件。
- 数据通过 Supabase 云端数据库保存，不再使用匿名共享写入。
- JA 身份可以查看已授权数据集；供应商只能查看和维护自己的数据集。
- Excel 数据源用于批量导入面料库，网站内新增的面料会按添加时间排序。
- 项目 GitHub 仓库：RaynaLi520/inventory。
- 推送到 main 分支后，可在 Vercel 项目中自动部署。

主要文件：
- index.html：成衣库存平台页面结构
- assets/inventory.js：成衣库存功能逻辑和演示数据
- assets/inventory.css：成衣库存响应式样式
- inventory-schema.sql：成衣 SKU、库位、库存流水和渠道配额数据表
- fabric.html：原面料平台页面结构
- assets/app.js：主要功能逻辑
- assets/styles.css：页面样式
- assets/seed-data.js：初始数据
- assets/supabase-config.js：Supabase 前端连接配置
- tools/import_fabrics.py：Excel 面料数据导入脚本
- tools/normalize_coz_inventory.py：将 CoZ GetTableDataWithOffset 响应按品牌筛选、按 SKU 去重并标准化为 JSON/CSV
- supabase-schema.sql：Supabase 数据表和策略 SQL

CoZ 库存响应验证：
python tools\normalize_coz_inventory.py "响应文件路径" --brand CoZ

生成标准化 JSON：
python tools\normalize_coz_inventory.py "响应文件路径" --brand CoZ --output coz-inventory.json

原始响应和标准化库存文件已加入 .gitignore，避免把内部库存数据提交到 GitHub。

登录和权限配置：
1. 在 Supabase Dashboard > Authentication > Providers 中启用 Email。
2. 在 Authentication > Email Templates > Magic Link 中保留验证码变量 {{ .Token }}。
   例如正文写：您的 JA 面料平台验证码是 {{ .Token }}。
   不要只保留 {{ .ConfirmationURL }}，否则邮件会变成链接而不是数字验证码。
3. 在 Authentication > URL Configuration 中设置：
   Site URL：https://fabricgarmenttool.vercel.app/
   Redirect URLs：https://fabricgarmenttool.vercel.app/**
4. 在 SQL Editor 完整执行 supabase-schema.sql。该脚本会创建 access_requests、审核函数和 RLS 策略；再执行 inventory-schema.sql 创建成衣库存表。
5. 首位 JA 管理员需要初始化一次：先用管理员邮箱登录，让用户出现在 Authentication > Users；复制 UUID 后运行：
   insert into public.user_profiles (id, role, supplier_name, display_name)
   values ('管理员用户UUID', 'ja', null, 'JA Administrator');
   刷新网站后，该账号会看到“身份审核”。之后不需要手写 SQL 审核普通用户。
6. 新用户流程：邮箱验证码登录 > 选择供应商或 JA 企业 > 填写供应商公司全称 > 提交审核。
7. JA 管理员在网站的“身份审核”中批准或拒绝。批准后数据库函数才会创建 user_profiles 正式身份。
8. 供应商只可读取和维护 supplier_name 与自己正式身份一致的数据；JA 可读取全部已授权数据集。

30 天登录说明：
- Supabase 客户端使用 persistSession 和自动刷新 Token 保持登录。
- 网站依据 Supabase 用户的 last_sign_in_at 强制最多保持 30 天；超过后必须重新输入邮箱验证码。
- 浏览器本地仅保存 Supabase 登录会话，不保存面料、报价或图片业务数据。
- 正式对外使用建议在 Authentication > SMTP Settings 配置自己的邮件服务；Supabase 默认邮件服务适合开发测试，发送额度和收件人有限。

自己修改页面：
- 修改标题：改 index.html 的 title 和 topbar h1；双语显示对应改 assets/app.js 的 copy.zh.title / copy.en.title。
- 修改页面结构：改 index.html。现在的可见内容主要集中在 fabricsPanel。
- 修改颜色、卡片大小、电脑和手机布局：改 assets/styles.css。
- 修改按钮文字、字段名称、状态提示：改 assets/app.js 的 copy.zh / copy.en。
- 修改常用面料的中英文：改 assets/app.js 顶部 fabricNameDictionary，每项格式为 ["中文", "English"]。
- 修改功能逻辑、排序、筛选和云端保存：改 assets/app.js。

每次修改后：
git add .
git commit -m "Update fabric platform"
git push

推送到 main 后，Vercel 会自动部署。

常用命令：
git status
git add .
git commit -m "Update fabric tool"
git push
