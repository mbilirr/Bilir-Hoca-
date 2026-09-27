/**
 * Comprehensive Unit Test Suite for Hardened Firestore Security Rules
 * Covers all 8 critical security invariant scenarios
 */

interface MockAuth {
  uid: string;
  token?: { email?: string };
}

interface MockRequest {
  auth: MockAuth | null;
  resource?: { data: Record<string, any> };
}

class HardenedFirestoreRulesEvaluator {
  private db: Record<string, Record<string, any>> = {};

  public setDocument(path: string, data: Record<string, any>) {
    this.db[path] = { ...data };
  }

  private isSignedIn(req: MockRequest): boolean {
    return req.auth != null;
  }

  private isUser(req: MockRequest, userId: string): boolean {
    return this.isSignedIn(req) && req.auth!.uid === userId;
  }

  private isAdmin(req: MockRequest): boolean {
    if (!this.isSignedIn(req)) return false;
    return (
      req.auth!.token?.email === 'm.bilirr@gmail.com' ||
      !!this.db[`admins/${req.auth!.uid}`]
    );
  }

  private isTeacher(req: MockRequest): boolean {
    return this.isAdmin(req) || (this.isSignedIn(req) && !!this.db[`teachers/${req.auth!.uid}`]);
  }

  private isAuthorizedForClass(req: MockRequest, classId: string): boolean {
    if (this.isAdmin(req)) return true;
    if (!this.isTeacher(req) || !classId) return false;
    const cls = this.db[`classes/${classId}`];
    if (!cls || !Array.isArray(cls.authorizedTeacherIds)) return false;
    return cls.authorizedTeacherIds.includes(req.auth!.uid);
  }

  private isAuthorizedForStudent(req: MockRequest, studentId: string): boolean {
    if (this.isAdmin(req)) return true;
    if (!this.isTeacher(req) || !studentId) return false;
    const std = this.db[`students/${studentId}`];
    if (!std) return false;
    if (Array.isArray(std.authorizedTeacherIds) && std.authorizedTeacherIds.includes(req.auth!.uid)) {
      return true;
    }
    if (std.classId && this.isAuthorizedForClass(req, std.classId)) {
      return true;
    }
    return false;
  }

  private isAuthorizedForTargetClasses(req: MockRequest, classIds?: string[]): boolean {
    if (this.isAdmin(req)) return true;
    if (!this.isTeacher(req)) return false;
    if (!classIds || classIds.length === 0) return true;
    return classIds.every((id) => this.isAuthorizedForClass(req, id));
  }

  private isAuthorizedForAssignedStudents(req: MockRequest, studentIds?: string[]): boolean {
    if (this.isAdmin(req)) return true;
    if (!this.isTeacher(req)) return false;
    if (!studentIds || studentIds.length === 0) return true;
    return studentIds.every((id) => this.isAuthorizedForStudent(req, id));
  }

  // 1. system_test
  public evaluateSystemTest(req: MockRequest): { allowed: boolean; reason: string } {
    if (this.isSignedIn(req)) return { allowed: true, reason: 'Signed-in user authorized for system_test' };
    return { allowed: false, reason: 'PERMISSION_DENIED: Unauthenticated request rejected' };
  }

  // 2. Class creation
  public evaluateCreateClass(req: MockRequest, classData: Record<string, any>): { allowed: boolean; reason: string } {
    if (this.isAdmin(req)) return { allowed: true, reason: 'Admin can create class' };
    if (
      this.isTeacher(req) &&
      Array.isArray(classData.authorizedTeacherIds) &&
      classData.authorizedTeacherIds.includes(req.auth!.uid)
    ) {
      return { allowed: true, reason: 'Verified teacher created class' };
    }
    return { allowed: false, reason: 'PERMISSION_DENIED: Only verified teachers (isTeacher) can create class' };
  }

  // 3. Student creation
  public evaluateCreateStudent(req: MockRequest, studentData: Record<string, any>): { allowed: boolean; reason: string } {
    if (this.isAdmin(req)) return { allowed: true, reason: 'Admin can create student' };
    if (this.isTeacher(req)) {
      if (studentData.classId && this.isAuthorizedForClass(req, studentData.classId)) {
        return { allowed: true, reason: 'Verified teacher created student for authorized class' };
      }
      if (Array.isArray(studentData.authorizedTeacherIds) && studentData.authorizedTeacherIds.includes(req.auth!.uid)) {
        return { allowed: true, reason: 'Verified teacher created individual student with self in authorizedTeacherIds' };
      }
    }
    return { allowed: false, reason: 'PERMISSION_DENIED: Only verified authorized teachers can create students' };
  }

  // 4. Student update
  public evaluateUpdateStudent(
    req: MockRequest,
    studentId: string,
    updatedData: Record<string, any>
  ): { allowed: boolean; reason: string } {
    const std = this.db[`students/${studentId}`];
    if (!std) return { allowed: false, reason: 'Student not found' };
    if (this.isAdmin(req)) return { allowed: true, reason: 'Admin update allowed' };

    const changedKeys = Object.keys(updatedData).filter(
      (k) => JSON.stringify(updatedData[k]) !== JSON.stringify(std[k])
    );

    if (this.isUser(req, studentId)) {
      const allowedStudentKeys = ['avatar', 'phone', 'email', 'updatedAt'];
      const hasIllegalKeys = changedKeys.some((k) => !allowedStudentKeys.includes(k));
      if (hasIllegalKeys) {
        return {
          allowed: false,
          reason: `PERMISSION_DENIED: Student cannot modify sensitive keys (${changedKeys.filter((k) => !allowedStudentKeys.includes(k)).join(', ')})`,
        };
      }
      return { allowed: true, reason: 'Student updated personal profile fields' };
    }

    if (this.isTeacher(req) && this.isAuthorizedForStudent(req, studentId)) {
      if (changedKeys.includes('authorizedTeacherIds')) {
        return { allowed: false, reason: 'PERMISSION_DENIED: Teacher cannot modify authorizedTeacherIds' };
      }
      return { allowed: true, reason: 'Authorized teacher updated student' };
    }

    return { allowed: false, reason: 'PERMISSION_DENIED: Unauthorized student update' };
  }

  // 5. Homework creation (All target classes)
  public evaluateCreateHomework(req: MockRequest, homeworkData: Record<string, any>): { allowed: boolean; reason: string } {
    if (this.isAdmin(req)) return { allowed: true, reason: 'Admin can create homework' };
    if (this.isTeacher(req) && this.isAuthorizedForTargetClasses(req, homeworkData.targetClassIds)) {
      return { allowed: true, reason: 'Teacher authorized for all target classes in homework' };
    }
    return { allowed: false, reason: 'PERMISSION_DENIED: Teacher not authorized for all target classes' };
  }

  // 6. Etut creation (All assigned students)
  public evaluateCreateEtut(req: MockRequest, etutData: Record<string, any>): { allowed: boolean; reason: string } {
    if (this.isAdmin(req)) return { allowed: true, reason: 'Admin can create etut' };
    if (
      this.isTeacher(req) &&
      etutData.teacherId === req.auth!.uid &&
      this.isAuthorizedForAssignedStudents(req, etutData.assignedStudentIds)
    ) {
      return { allowed: true, reason: 'Teacher authorized for all assigned students in etut' };
    }
    return { allowed: false, reason: 'PERMISSION_DENIED: Teacher not authorized for all assigned students in etut' };
  }

  // 7. Messages creation (Anti-spoofing)
  public evaluateCreateMessage(req: MockRequest, messageData: Record<string, any>): { allowed: boolean; reason: string } {
    if (!this.isSignedIn(req)) return { allowed: false, reason: 'PERMISSION_DENIED: Not signed in' };
    if (messageData.senderId !== req.auth!.uid) {
      return { allowed: false, reason: `PERMISSION_DENIED: Spoofed senderId (${messageData.senderId}) != auth.uid (${req.auth!.uid})` };
    }
    return { allowed: true, reason: 'Message created with verified senderId' };
  }

  // 8. Teacher documents read
  public evaluateReadTeacherDocuments(req: MockRequest): { allowed: boolean; reason: string } {
    if (this.isTeacher(req)) return { allowed: true, reason: 'Verified teacher access to shared zümre archive' };
    return { allowed: false, reason: 'PERMISSION_DENIED: Non-teacher cannot access teacher documents' };
  }
}

async function runHardenedTests() {
  console.log('================================================================');
  console.log('🛡️  HARDENED FIRESTORE SECURITY RULES - VERIFICATION SUITE');
  console.log('================================================================\n');

  const evaluator = new HardenedFirestoreRulesEvaluator();

  // Seed DB
  evaluator.setDocument('teachers/teacher-1', { id: 'teacher-1', name: 'Ayşe Öğretmen' });
  evaluator.setDocument('teachers/teacher-2', { id: 'teacher-2', name: 'Fatma Öğretmen' });
  evaluator.setDocument('admins/admin-root', { id: 'admin-root', email: 'm.bilirr@gmail.com' });

  evaluator.setDocument('classes/class-8a', {
    id: 'class-8a',
    name: '8/A',
    authorizedTeacherIds: ['teacher-1'],
  });

  evaluator.setDocument('classes/class-8b', {
    id: 'class-8b',
    name: '8/B',
    authorizedTeacherIds: ['teacher-2'],
  });

  evaluator.setDocument('students/student-1', {
    id: 'student-1',
    name: 'Mert Ak',
    username: 'mertak',
    studentNumber: '301',
    classId: 'class-8a',
    avatar: 'avatar.png',
    phone: '05321112233',
    email: 'mert@school.local',
    authorizedTeacherIds: [],
  });

  evaluator.setDocument('students/student-2', {
    id: 'student-2',
    name: 'Gizem Tan',
    username: 'gizemtan',
    studentNumber: '302',
    classId: 'class-8b',
    avatar: 'avatar2.png',
    phone: '05329998877',
    email: 'gizem@school.local',
    authorizedTeacherIds: [],
  });

  const reqAnon: MockRequest = { auth: null };
  const reqStudent1: MockRequest = { auth: { uid: 'student-1' } };
  const reqTeacher1: MockRequest = { auth: { uid: 'teacher-1' } };
  const reqTeacher2: MockRequest = { auth: { uid: 'teacher-2' } };

  let passed = 0;
  let total = 0;

  function runCheck(title: string, expected: boolean, res: { allowed: boolean; reason: string }) {
    total++;
    const ok = res.allowed === expected;
    if (ok) passed++;
    console.log(`${ok ? '✅ PASS' : '❌ FAIL'} [Scenario ${total}] ${title}`);
    console.log(`   - Expected: ${expected ? 'ALLOWED' : 'DENIED'} | Result: ${res.allowed ? 'ALLOWED' : 'DENIED'}`);
    console.log(`   - Rule Logic: ${res.reason}\n`);
  }

  // 1. system_test: anonymous is rejected, signed in is allowed
  runCheck('Anonymous request to /system_test is rejected', false, evaluator.evaluateSystemTest(reqAnon));
  runCheck('Signed-in request to /system_test is allowed', true, evaluator.evaluateSystemTest(reqTeacher1));

  // 2. Class creation: Student attempting to create class with self in authorizedTeacherIds (Must be DENIED)
  runCheck(
    'Student attempts to create a class pretending to be teacher',
    false,
    evaluator.evaluateCreateClass(reqStudent1, { id: 'cls-fake', name: 'Fake Class', authorizedTeacherIds: ['student-1'] })
  );

  // 3. Class creation: Verified Teacher creates class (Must be ALLOWED)
  runCheck(
    'Verified Teacher-1 creates new class with self in authorizedTeacherIds',
    true,
    evaluator.evaluateCreateClass(reqTeacher1, { id: 'cls-new', name: '8/C', authorizedTeacherIds: ['teacher-1'] })
  );

  // 4. Student update: Student updating allowed personal profile fields (Must be ALLOWED)
  runCheck(
    'Student-1 updates personal avatar and phone',
    true,
    evaluator.evaluateUpdateStudent(reqStudent1, 'student-1', {
      ...{ id: 'student-1', name: 'Mert Ak', username: 'mertak', studentNumber: '301', classId: 'class-8a', authorizedTeacherIds: [] },
      avatar: 'new_avatar.png',
      phone: '05550001122',
    })
  );

  // 5. Student update: Student attempting to change studentNumber, classId or authorizedTeacherIds (Must be DENIED)
  runCheck(
    'Student-1 attempts to modify sensitive fields (studentNumber, classId, authorizedTeacherIds)',
    false,
    evaluator.evaluateUpdateStudent(reqStudent1, 'student-1', {
      ...{ id: 'student-1', name: 'Mert Ak', username: 'mertak', studentNumber: '301', classId: 'class-8a', authorizedTeacherIds: [] },
      studentNumber: '999',
      classId: 'class-8b',
      authorizedTeacherIds: ['student-1'],
    })
  );

  // 6. Homework creation: Teacher-1 creates homework targeting Class 8/A (Authorized) AND Class 8/B (Unauthorized) (Must be DENIED)
  runCheck(
    'Teacher-1 attempts to create homework for multiple classes including unauthorized Class 8/B',
    false,
    evaluator.evaluateCreateHomework(reqTeacher1, {
      id: 'hw-1',
      title: 'Matematik Ödevi',
      targetClassIds: ['class-8a', 'class-8b'],
    })
  );

  // 7. Homework creation: Teacher-1 creates homework targeting only authorized Class 8/A (Must be ALLOWED)
  runCheck(
    'Teacher-1 creates homework targeting only authorized Class 8/A',
    true,
    evaluator.evaluateCreateHomework(reqTeacher1, {
      id: 'hw-2',
      title: 'Matematik Ödevi 2',
      targetClassIds: ['class-8a'],
    })
  );

  // 8. Etut creation: Teacher-1 creates etut with Student-1 (Authorized) AND Student-2 (Unauthorized) (Must be DENIED)
  runCheck(
    'Teacher-1 attempts to create etut with multiple students including unauthorized Student-2',
    false,
    evaluator.evaluateCreateEtut(reqTeacher1, {
      id: 'etut-1',
      teacherId: 'teacher-1',
      assignedStudentIds: ['student-1', 'student-2'],
    })
  );

  // 9. Etut creation: Teacher-1 creates etut with only authorized Student-1 (Must be ALLOWED)
  runCheck(
    'Teacher-1 creates etut with only authorized Student-1',
    true,
    evaluator.evaluateCreateEtut(reqTeacher1, {
      id: 'etut-2',
      teacherId: 'teacher-1',
      assignedStudentIds: ['student-1'],
    })
  );

  // 10. Messages: Spoofed senderId (Must be DENIED)
  runCheck(
    'Teacher-1 attempts to send message with spoofed senderId = teacher-2',
    false,
    evaluator.evaluateCreateMessage(reqTeacher1, { senderId: 'teacher-2', message: 'Fake message' })
  );

  // 11. Messages: Genuine senderId (Must be ALLOWED)
  runCheck(
    'Teacher-1 sends message with genuine senderId = teacher-1',
    true,
    evaluator.evaluateCreateMessage(reqTeacher1, { senderId: 'teacher-1', message: 'Genuine message' })
  );

  // 12. Teacher Documents: Verified teacher reads shared documents (Must be ALLOWED)
  runCheck('Verified Teacher reads shared zümre documents', true, evaluator.evaluateReadTeacherDocuments(reqTeacher1));

  // 13. Teacher Documents: Student reads teacher documents (Must be DENIED)
  runCheck('Student attempts to read teacher documents', false, evaluator.evaluateReadTeacherDocuments(reqStudent1));

  console.log('================================================================');
  console.log(`📊 TOTAL CHECKS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  if (passed === total) {
    console.log('🎉 100% OF SECURITY INVARIANTS PASSED VERIFICATION');
  }
  console.log('================================================================\n');
}

runHardenedTests().catch(console.error);
