def test_me_classes_as_teacher(http_client_with_token, teacher_token, db, class_id, config):
    c = http_client_with_token(teacher_token)
    r = c.get("/api/classes/me/classes")
    assert r["status"] == 200, r["text"]
    body = r["body"]
    as_teacher = body.get("asTeacher", [])
    assert isinstance(as_teacher, list)
    assert any(citem["classId"] == class_id["classId"] for citem in as_teacher), \
        f"teacher must see own class. got: {as_teacher}"

    db_rows = db.query(
        "SELECT class_id FROM class_teachers WHERE user_id IN "
        "(SELECT id FROM users WHERE school = ? AND role = 'teacher')",
        (config["TEST_SCHOOL"],),
    )
    assert class_id["classId"] in {row["class_id"] for row in db_rows}


def test_me_classes_as_student(http_client_with_token, admin_token, db, class_id, config):
    import time as _time
    admin_c = http_client_with_token(admin_token)
    ts = "apitest_join_" + str(int(_time.time() * 1000))[-6:]
    create_r = admin_c.post(
        "/api/admin/users",
        json={
            "school": config["TEST_SCHOOL"],
            "studentId": ts,
            "password": "pw",
            "role": "student",
            "name": "JoinTest",
        },
    )
    assert create_r["status"] in (201, 409), create_r["text"]
    if create_r["status"] == 201:
        user_body = create_r["body"]
        uid = user_body.get("id") or user_body.get("userId")
    else:
        row = db.fetchone(
            "SELECT id FROM users WHERE school = ? AND student_id = ?",
            (config["TEST_SCHOOL"], ts),
        )
        uid = row["id"] if row else None
    assert uid, f"could not determine userId for {ts}"

    join_r = admin_c.post(
        f"/api/classes/{class_id['classId']}/students",
        json={"targetSchool": config["TEST_SCHOOL"], "targetStudentId": ts},
    )
    assert join_r["status"] in (200, 201, 404, 409), f"join failed: {join_r['status']} {join_r['text']}"

    s_login = http_client_with_token(None)
    lr = s_login.post(
        "/api/auth/login",
        json={"school": config["TEST_SCHOOL"], "studentId": ts, "password": "pw"},
    )
    assert lr["status"] == 200, lr["text"]
    s_token = lr["body"]["token"]

    sc = http_client_with_token(s_token)
    r = sc.get("/api/classes/me/classes")
    assert r["status"] == 200, r["text"]
    body = r["body"]
    as_student = body.get("asStudent", [])
    assert any(citem["classId"] == class_id["classId"] for citem in as_student), \
        f"joined student must see class. got: {as_student}"