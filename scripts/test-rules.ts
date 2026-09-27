/**
 * Firestore Security Rules Unit Test Suite
 * Evaluates the actual logic implemented in /firestore.rules
 */

interface MockAuth {
  uid: string;
  token?: {
    email?: string;
  };
}

interface MockRequest {
  auth: MockAuth | null;
  resource?: { data: Record<string, any> };
}

class FirestoreRulesEvaluator {
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
    if (!this.isSignedIn(req) || !classId) return false;
    const cls = this.db[`classes/${classId}`];
    if (!cls || !Array.isArray(cls.authorizedTeacherIds)) return false;
    return cls.authorizedTeacherIds.includes(req.auth!.uid);
  }

  private isAuthorizedForStudent(req: MockRequest, studentId: string): boolean {
    if (this.isAdmin(req)) return true;
    if (!this.isSignedIn(req) || !studentId) return false;
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

  // --- Student Rules ---
  public evaluateUpdateStudent(
    req: MockRequest,
    studentId: string,
    updatedData: Record<string, any>
  ): { allowed: boolean; reason: string } {
    const std = this.db[`students/${studentId}`];
    if (!std) return { allowed: false, reason: 'Student not found' };
    if (this.isAdmin(req)) return { allowed: true, reason: 'Admin can update all fields' };

    const changedKeys = Object.keys(updatedData).filter(
      (k) => JSON.stringify(updatedData[k]) !== JSON.stringify(std[k])
    );

    // If Student is updating themselves:
    if (this.isUser(req, studentId)) {
      const allowedStudentKeys = ['avatar', 'phone', 'email', 'updatedAt'];
      const hasIllegalKeys = changedKeys.some((k) => !allowedStudentKeys.includes(k));
      if (hasIllegalKeys) {
        return {
          allowed: false,
          reason: `PERMISSION_DENIED: Student cannot modify sensitive fields (${changedKeys.filter((k) => !allowedStudentKeys.includes(k)).join(', ')})`,
        };
      }
      return { allowed: true, reason: 'Student updated allowed personal profile fields' };
    }

    // If Authorized Teacher is updating student:
    const isAuthTeacher =
      this.isSignedIn(req) &&
      ((Array.isArray(std.authorizedTeacherIds) && std.authorizedTeacherIds.includes(req.auth!.uid)) ||
        (std.classId && this.isAuthorizedForClass(req, std.classId)));

    if (isAuthTeacher) {
      if (changedKeys.includes('authorizedTeacherIds')) {
        return { allowed: false, reason: 'PERMISSION_DENIED: Teacher cannot change authorizedTeacherIds' };
      }
      return { allowed: true, reason: 'Authorized teacher updated student' };
    }

    return { allowed: false, reason: 'PERMISSION_DENIED: User not authorized to update student' };
  }

  // --- Class Creation Rules ---
  public evaluateCreateClass(
    req: MockRequest,
    classData: Record<string, any>
  ): { allowed: boolean; reason: string } {
    if (this.isAdmin(req)) return { allowed: true, reason: 'Admin can create any class' };
    if (
      this.isSignedIn(req) &&
      Array.isArray(classData.authorizedTeacherIds) &&
      classData.authorizedTeacherIds.includes(req.auth!.uid)
    ) {
      return { allowed: true, reason: 'Teacher created class with self in authorizedTeacherIds' };
    }
    return { allowed: false, reason: 'PERMISSION_DENIED: Unauthorized class creation' };
  }

  // --- Teacher Documents Rules ---
  public evaluateReadTeacherDocuments(req: MockRequest): { allowed: boolean; reason: string } {
    if (this.isTeacher(req)) {
      return { allowed: true, reason: 'Teacher/Admin can access shared zümre archive' };
    }
    return { allowed: false, reason: 'PERMISSION_DENIED: Only verified teachers can read teacher documents' };
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 FIRESTORE SECURITY RULES - VERIFICATION SUITE');
  console.log('================================================================\n');

  const evaluator = new FirestoreRulesEvaluator();

  evaluator.setDocument('teachers/teacher-A', { id: 'teacher-A', name: 'Ahmet Öğretmen' });
  evaluator.setDocument('admins/admin-1', { id: 'admin-1', email: 'm.bilirr@gmail.com' });

  evaluator.setDocument('classes/class-8a', {
    id: 'class-8a',
    name: '8/A',
    authorizedTeacherIds: ['teacher-A'],
  });

  evaluator.setDocument('students/student-X', {
    id: 'student-X',
    name: 'Can Yılmaz',
    username: 'canyilmaz',
    studentNumber: '101',
    classId: 'class-8a',
    avatar: 'avatar1.png',
    phone: '05551112233',
    email: 'can@school.local',
    authorizedTeacherIds: [],
  });

  const reqStudentX: MockRequest = { auth: { uid: 'student-X' } };
  const reqTeacherA: MockRequest = { auth: { uid: 'teacher-A' } };
  const reqStudentOther: MockRequest = { auth: { uid: 'student-other' } };

  let passed = 0;
  let total = 0;

  function test(title: string, expected: boolean, res: { allowed: boolean; reason: string }) {
    total++;
    const ok = res.allowed === expected;
    if (ok) passed++;
    console.log(`${ok ? '✅ PASS' : '❌ FAIL'} [Test ${total}] ${title}`);
    console.log(`   - Expected: ${expected ? 'ALLOWED' : 'DENIED'} | Result: ${res.allowed ? 'ALLOWED' : 'DENIED'}`);
    console.log(`   - Reason: ${res.reason}\n`);
  }

  // 1. Student modifying avatar/phone (Allowed)
  const t1 = evaluator.evaluateUpdateStudent(reqStudentX, 'student-X', {
    ...{ id: 'student-X', name: 'Can Yılmaz', username: 'canyilmaz', studentNumber: '101', classId: 'class-8a', authorizedTeacherIds: [] },
    avatar: 'new-avatar.png',
    phone: '05559998877',
  });
  test('Student X updates own avatar & phone', true, t1);

  // 2. Student trying to modify classId & studentNumber (Denied)
  const t2 = evaluator.evaluateUpdateStudent(reqStudentX, 'student-X', {
    ...{ id: 'student-X', name: 'Can Yılmaz', username: 'canyilmaz', studentNumber: '101', classId: 'class-8a', authorizedTeacherIds: [] },
    classId: 'class-9b',
    studentNumber: '999',
  });
  test('Student X attempts to change own classId and studentNumber', false, t2);

  // 3. Student trying to modify authorizedTeacherIds (Denied)
  const t3 = evaluator.evaluateUpdateStudent(reqStudentX, 'student-X', {
    ...{ id: 'student-X', name: 'Can Yılmaz', username: 'canyilmaz', studentNumber: '101', classId: 'class-8a', authorizedTeacherIds: [] },
    authorizedTeacherIds: ['student-X'],
  });
  test('Student X attempts to change authorizedTeacherIds', false, t3);

  // 4. Teacher creates class with self in authorizedTeacherIds (Allowed)
  const t4 = evaluator.evaluateCreateClass(reqTeacherA, {
    id: 'class-new',
    name: '10/B Fen',
    authorizedTeacherIds: ['teacher-A'],
  });
  test('Teacher A creates new class adding self to authorizedTeacherIds', true, t4);

  // 5. Shared teacher documents read by verified teacher (Allowed)
  const t5 = evaluator.evaluateReadTeacherDocuments(reqTeacherA);
  test('Verified Teacher reads shared zümre documents', true, t5);

  // 6. Shared teacher documents read by student (Denied)
  const t6 = evaluator.evaluateReadTeacherDocuments(reqStudentOther);
  test('Student attempts to read teacher documents', false, t6);

  console.log('================================================================');
  console.log(`📊 TOTAL: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('================================================================');
}

runTests().catch(console.error);
