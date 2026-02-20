# Slack Jira & Workspace Bot Plan

## 1. Overview
Dự án xây dựng một Slack Bot đóng vai trò như một "Control Center" hai chiều (Interactive Control Center).
Mục đích: Tập trung hóa quản lý tiến độ Jira và tra cứu tài liệu Google Workspace trực tiếp trên Slack, giảm thiểu context switching cho team (đặc biệt là Dev/PM).

## 2. Project Type
**BACKEND**

## 3. Success Criteria
- [ ] User có thể gõ Slash command `/jira [mã task]` để xem chi tiết Jira ticket ngay trong Slack.
- [ ] User có thể chuyển trạng thái ticket (VD: To Do -> In Progress) thông qua nút bấm trên tin nhắn Slack.
- [ ] User có thể dán link tài liệu Google Drive vào và bot trả về Preview hoặc tìm kiếm file `/doc [từ khóa]`.
- [ ] Tích hợp luồng Authentication OAuth2 cơ bản để bot gọi API thay mặt user (tùy chọn hoặc thiết lập Account ID mapping).

## 4. Tech Stack & Rationale
- **Node.js + TypeScript (hoặc JS thuần):** Phù hợp nhất cho hệ sinh thái Slack API.
- **`@slack/bolt` framework:** Thư viện chính chủ, xử lý Events/Interactivity rất tinh gọn.
- **Express.js (tùy chọn kết hợp):** Nếu cần handle thêm OAuth callbacks.
- **Axios / Jira.js / Googleapis:** SDK/Library để tương tác với Jira và Google.
- **Database (PostgreSQL / SQLite / Firebase):** Lưu thông tin mapping giữa Slack User ID, Jira Account ID, và Tokens. Bắt đầu bằng SQLite/JSON cho lộ trình MVP.

## 5. File Structure (Dự kiến)
```text
/slack-bot
├── src/
│   ├── app.js               # Entry point (Khởi tạo App Bolt)
│   ├── config/              # Biến môi trường, constants
│   ├── controllers/         # Xử lý logic cho các Slack Events / Commands
│   ├── services/
│   │   ├── jiraService.js   # Các hàm gọi Jira API
│   │   └── googleService.js # Các hàm gọi Google API
│   └── utils/               # Helpers, format blocks JSON
├── package.json
└── .env                     # Lưu trữ Slack Token, Jira API Token
```

## 6. Task Breakdown

### Phase 1: MVP - Cài đặt cơ sở & Xem thông tin (Read-only)
- **Task 1: Setup project Node.js & Slack Bolt**
  - **Agent:** `backend-specialist`
  - **Skills:** `nodejs-best-practices`, `api-patterns`
  - **INPUT:** Project rỗng -> **OUTPUT:** Server Node.js chạy được, App Bolt kết nối Slack qua Socket Mode. -> **VERIFY:** Gõ thử bot phản hồi "Hello".
- **Task 2: Tích hợp Jira REST API Client**
  - **Agent:** `backend-specialist`
  - **Skills:** `clean-code`
  - **INPUT:** `jiraService.js` rỗng -> **OUTPUT:** Hàm `getIssue(issueId)` gọi thành công Jira API lấy info. -> **VERIFY:** Console log ra đúng summary của ticket.
- **Task 3: Slash Command `/jira [ID]`**
  - **Agent:** `backend-specialist`
  - **Skills:** `api-patterns`
  - **INPUT:** Slack Command event -> **OUTPUT:** Bot reply bằng giao diện Block Kit chứa summary, status, assignee. -> **VERIFY:** Test thực tế trên ứng dụng Slack, trả về đúng khối UI mong muốn (không lỗi layout).

### Phase 2: Interactivity (Cập nhật trạng thái)
- **Task 4: Setup Database (Mapping User)**
  - **Agent:** `backend-specialist` (hoặc `database-architect`)
  - **Skills:** `database-design`
  - **INPUT:** Yêu cầu lưu ID -> **OUTPUT:** Bảng Map `Slack_ID` -> `Jira_ID`. -> **VERIFY:** Script test CRUD OK.
- **Task 5: Xử lý Button Click (Chuyển Status)**
  - **Agent:** `backend-specialist`
  - **Skills:** `nodejs-best-practices`
  - **INPUT:** Action "transition_issue" -> **OUTPUT:** Server nhận event, gọi Jira API đổi status, update lại message trên Slack. -> **VERIFY:** Bấm nút "In Progress" -> Label trên Slack và trên Jira web đều đổi.

## 7. Phase X: Verification (Mandatory Scripts Check)
```markdown
- [ ] Run Linter: `npm run lint`
- [ ] Run Security Scan: `python .agent/skills/vulnerability-scanner/scripts/security_scan.py .`
- [ ] Run Test: `npm run test` (nếu có Unit Test)
```
Tất cả các scripts phải vượt qua không có lỗi rủi ro nào.
