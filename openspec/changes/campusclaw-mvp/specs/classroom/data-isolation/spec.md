## Purpose

定义横向的学校级数据隔离契约。所有 API 端点 MUST 遵守此契约，确保不同学校间的数据相互不可见、不可操作。admin 角色作为全局用户豁免于此限制。

## ADDED Requirements

### Requirement: 所有资源携带 school 归属
数据库中所有用户可访问的资源记录 MUST 直接或间接携带一个 school 字段。users 表直接存储 school；classes 表存储 school；materials、knowledge_bases、kb_documents、class_teachers、class_students 等通过外键 JOIN classes.school 获取归属。

#### Scenario: 数据模型完整性
- **WHEN** 检查任意资源记录
- **THEN** 均可追溯到唯一的学校归属

### Requirement: 读取隔离
对任何返回资源数据的 API 端点，系统 MUST 在查询条件中加入调用方的 school 过滤（admin 除外）。查询条件 MUST 为 `resource.school = caller.school` 或通过 JOIN 间接实现。admin 调用时不附加此条件。

#### Scenario: teacher 无法看到其他学校的班级
- **WHEN** school="A" 的 teacher 查询班级列表
- **THEN** 返回结果中绝不包含 school="B" 的班级

#### Scenario: student 无法下载其他学校的教学资料
- **WHEN** school="A" 的 student 尝试下载 school="B" 班级的资料
- **THEN** 系统返回 HTTP 403 Forbidden

#### Scenario: admin 跨学校查询
- **WHEN** admin 查询任意学校的班级、资料或知识库
- **THEN** 系统正常返回结果，不因 school 过滤

### Requirement: 写入隔离
对任何创建、修改、删除资源的 API 端点，系统 MUST 在执行写入前校验目标资源的 school 与调用方一致。不一致则 MUST 返回 HTTP 403 Forbidden。admin 作为调用方时豁免此校验。

#### Scenario: teacher 无法向其他学校的班级添加学生
- **WHEN** school="A" 的 teacher 尝试向 school="B" 的班级添加学生
- **THEN** 系统返回 HTTP 403 Forbidden

#### Scenario: teacher 无法将其他学校的教师邀请进自己的班级
- **WHEN** school="A" 的 teacher 邀请 school="B" 的 teacher 加入自己 school="A" 的班级
- **THEN** 系统返回 HTTP 403 Forbidden

#### Scenario: admin 修改任意学校资源
- **WHEN** admin 向任意 school 的班级添加学生、教师或上传资料
- **THEN** 系统正常执行写入

### Requirement: 成员关系不跨学校
class_teachers 和 class_students 多对多关系表 MUST 禁止跨学校的成员关联。即便 admin 操作，也只能添加与目标 class school 一致的用户。

#### Scenario: admin 也不能跨学校添加
- **WHEN** admin 尝试将 school="A" 的教师加入 school="B" 的班级
- **THEN** 系统返回 HTTP 400 或 403，拒绝操作