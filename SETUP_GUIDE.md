# Slack & Jira Bot: Detailed Setup Guide

Tài liệu này hướng dẫn chi tiết từng bước để cấu hình Bot liên kết giữa Slack và Jira Cloud, giúp bạn tra cứu và tương tác với các Jira Ticket ngay từ Slack.

---

## Bước 1: Khởi tạo Slack App và lấy Token

1. Truy cập [Slack API: Your Apps](https://api.slack.com/apps) và đăng nhập bằng tài khoản làm việc của bạn.
2. Bấm **"Create New App"** -> Chọn **"From scratch"**.
3. Điền App Name (VD: *Startup Jira Bot*) và chọn Workspace mà bạn muốn cài đặt.
4. **Cấu hình App-Level Token (Để dùng Socket Mode):**
   - Kéo xuống mục **App-Level Tokens** ở trang `Basic Information`.
   - Bấm **"Generate Token and Scopes"**. Đặt tên tùy ý.
   - Chọn Scope là `connections:write`.
   - Copy mã token bắt đầu bằng `xapp-...` và dán vào biến `SLACK_APP_TOKEN` trong file `.env`.
5. **Kích hoạt Socket Mode:**
   - Ở menu bên trái, chọn **"Socket Mode"** và gạt công tắc sang bật (On).
   - Thao tác này giúp bot chạy nội bộ (localhost) mà không cần cấu hình https webhook.
6. **Lấy Bot Token (Để bot có quyền nhắn tin):**
   - Ở menu trái, chọn **"OAuth & Permissions"**.
   - Kéo xuống mục **Scopes** -> **Bot Token Scopes**, bấm "Add an OAuth Scope" và thêm các quyền sau:
     - `chat:write` (Để gửi tin nhắn)
     - `commands` (Để tạo slash commands)
     - `im:write` (Gửi direct message nếu cần)
   - Kéo lên đầu trang này, bấm **"Install to Workspace"** (Cài đặt app vào nhóm chat).
   - Sao chép Token (bắt đầu bằng `xoxb-...`) và dán vào biến `SLACK_BOT_TOKEN`.
7. **Lấy Signing Secret:**
   - Quay lại trang **"Basic Information"**.
   - Kéo xuống mục **App Credentials**, bấm nút "Show" kế bên chữ **Signing Secret**.
   - Sao chép chuỗi mã và dán vào biến `SLACK_SIGNING_SECRET`.

---

## Bước 2: Thiết lập Tương tác trên Slack (Features)

1. **Tạo Slash Command (`/jira`):**
   - Ở menu trái trang quản lý App Slack, chọn **"Slash Commands"**.
   - Bấm **"Create New Command"**.
   - Command: `/jira`
   - Short Description: Xem thông tin và thao tác với Jira ticket.
   - Usage Hint: `[Mã vé (VD: PROJ-123)]`
   - Bấm **Save**.
2. **Bật Interactivity (Nút bấm):**
   - Ở menu trái chọn **"Interactivity & Shortcuts"**.
   - Gạt công tắc sang bật (On).
   - *Lưu ý:* Do mới bật lần đầu, Slack có thể bắt buộc nhập 1 link vào ô **Request URL**. Vì chúng ta đang dùng Socket Mode (local), bạn có thể nhập một link giả bất kỳ (VD: `https://example.com/slack/events`) rồi bấm **Save Changes**. Slack sẽ ưu tiên đẩy dữ liệu về kết nối Socket Mode của app nội bộ thay vì gọi link đó.

---

## Bước 3: Cấu hình Jira API Token

Bot sử dụng chuẩn **Basic Authentication** theo cấu trúc `Email : API_Token`.

1. **Lấy thông tin Domain:**
   - Jira Cloud thường có URL: `https://[tên-công-ty].atlassian.net`. Dãy `[tên-công-ty].atlassian.net` chính là domain gốc.
   - Nhập vào `JIRA_DOMAIN` trong file `.env`.
2. **Email của tài khoản Jira:**
   - Dùng tài khoản Jira dùng để tạo token (Nên là tài khoản có quyền đọc/ghi dự án). Nhập email vào `JIRA_EMAIL`.
3. **Tạo API Token:**
   - Đăng nhập Jira, bấm vào Avatar ở góc phải trên -> Chọn **"Manage account"**.
   - Chuyển sang thẻ **"Security"**. Bấm vào **"Create and manage API tokens"**.
   - Bấm **"Create API token"**, nhập nhãn (VD: Slack Bot Token).
   - Copy chuỗi mã hóa và dán vào `JIRA_API_TOKEN` trong `.env`.

> ⚠️ Ghi chú: Mã token này chỉ hiện ONE TIME duy nhất, hãy chắc chắn lưu vào `.env` đúng cách.

---

## Bước 4: Chạy Local và Thử nghiệm

1. Tạo file `.env` từ file `.env.example` và điền đủ 6 tham số trên:
   ```env
   PORT=3000
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_SIGNING_SECRET=...
   SLACK_APP_TOKEN=xapp-...
   
   JIRA_DOMAIN=your-startup.atlassian.net
   JIRA_EMAIL=dev@startup.com
   JIRA_API_TOKEN=...
   ```
2. Mở Terminal tại thư mục `slack-bot`, cài đặt thư viện NPM:
   ```bash
   npm install
   ```
3. Khởi động server (Mặc định ở `http://localhost:3000`):
   ```bash
   npm start 
   # Hoặc node src/app.js
   ```
4. Khi terminal in ra `⚡️ Slack bot is running on port 3000!`, app đã sẵn sàng phục vụ.
5. Mở ứng dụng Slack, chọn một Channel bất kì hoặc nhắn tin trực tiếp với con Bot (Tìm mên Startup Jira Bot vừa tạo).
6. Nhập lệnh `/jira [MÃ-TICKET-TỒN-TẠI]` và Enter. (VD: `/jira HR-01`).
7. Bấm thử các nút trạng thái hiện ra (In Progress, Resolved...) và xem kết quả nó cập nhật thẳng về Jira.

**Troubleshooting:** Nghẽn lệnh `/jira`?
Thi thoảng sau khi vừa Update quyền scope/slash command trên website Slack API, app yêu cầu bạn phải cài đặt lại workspace. Bạn để ý dải băng vàng trên cùng web hướng dẫn click **Reinstall your app** là xong.
