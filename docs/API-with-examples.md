# Vebgenix API Documentation With Examples

- Collection: `Vebgenix API`
- Requests documented: `172`
- Generated: `2026-05-06`

> Readable sample input shows the data you enter. For `AWSJSON` GraphQL inputs, the actual Postman body stringifies that JSON, so the raw request can contain escaped quotes. Passwords and tokens are redacted.

## Module Summary

| Module | Requests |
|---|---:|
| Academics | 52 |
| Admissions | 18 |
| Audit & Cleanup | 3 |
| Auth (Cognito) | 5 |
| Comms | 4 |
| Finance | 44 |
| Health | 1 |
| Identity | 8 |
| Platform Admin | 20 |
| Results | 3 |
| Settings | 12 |
| Storage | 2 |

## Academics

### Create Class

- Folder: `Academics / Classes`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CreateClass`
- Variables: `input`
- Saves: `class_id`

**Sample input data (readable)**

```json
{
  "input": {
    "name": "Grade 10",
    "code": "G10",
    "campusId": "69fae2a012627d3790c2e8a1",
    "academicYearId": "69fae2a012627d3790c2e8a1",
    "programId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CreateClass($input: AWSJSON!) { createClass(input: $input) }",
  "variables": {
    "input": "{\"name\":\"Grade 10\",\"code\":\"G10\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"academicYearId\":\"69fae2a012627d3790c2e8a1\",\"programId\":\"69fae2a012627d3790c2e8a1\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "createClass": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Grade 10",
      "code": "G10",
      "status": "ACTIVE"
    }
  }
}
```

### List Classes

- Folder: `Academics / Classes`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `class_id`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listClasses(academicYearId: \"69fae2a012627d3790c2e8a1\") }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listClasses": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "name": "Grade 10",
        "code": "G10",
        "status": "ACTIVE"
      }
    ]
  }
}
```

### Create Section

- Folder: `Academics / Classes`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CreateSection`
- Variables: `classId, input`
- Saves: `section_id`

**Sample input data (readable)**

```json
{
  "classId": "69fae2a012627d3790c2e8a1",
  "input": {
    "name": "A",
    "academicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "capacity": 40
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CreateSection($classId: ID!, $input: AWSJSON!) { createSection(classId: $classId, input: $input) }",
  "variables": {
    "classId": "69fae2a012627d3790c2e8a1",
    "input": "{\"name\":\"A\",\"academicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"capacity\":40}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "createSection": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "A",
      "classId": "69fae2a012627d3790c2e8a1",
      "academicYearId": "69fae2a012627d3790c2e8a1",
      "capacity": 40
    }
  }
}
```

### List Sections

- Folder: `Academics / Classes`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `section_id`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listAllSections(classId: \"69fae2a012627d3790c2e8a1\", academicYearId: \"69fae2a012627d3790c2e8a1\") }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listAllSections": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "name": "A",
        "classId": "69fae2a012627d3790c2e8a1",
        "academicYearId": "69fae2a012627d3790c2e8a1",
        "capacity": 40
      }
    ]
  }
}
```

### Create Subject

- Folder: `Academics / Subjects & Timetable Builder`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CreateSubject`
- Variables: `input`
- Saves: `subject_id`

**Sample input data (readable)**

```json
{
  "input": {
    "name": "Mathematics",
    "code": "MATH",
    "campusId": "69fae2a012627d3790c2e8a1",
    "type": "CORE",
    "creditsOrPeriods": 5
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CreateSubject($input: AWSJSON!) { createSubject(input: $input) }",
  "variables": {
    "input": "{\"name\":\"Mathematics\",\"code\":\"MATH\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"type\":\"CORE\",\"creditsOrPeriods\":5}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "createSubject": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Mathematics",
      "code": "MATH10",
      "subjectType": "CORE"
    }
  }
}
```

### List Subjects

- Folder: `Academics / Subjects & Timetable Builder`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query ListSubjects`
- Variables: `campusId`
- Saves: `subject_id`

**Sample input data (readable)**

```json
{
  "campusId": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query ListSubjects($campusId: ID) { listSubjects(campusId: $campusId) }",
  "variables": {
    "campusId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "listSubjects": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "name": "Mathematics",
        "code": "MATH10",
        "subjectType": "CORE"
      }
    ]
  }
}
```

### Replace Section Timetable

- Folder: `Academics / Subjects & Timetable Builder`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation ReplaceSectionTimetable`
- Variables: `sectionId, slots`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "sectionId": "69fae2a012627d3790c2e8a1",
  "slots": [
    {
      "dayOfWeek": "MON",
      "periodNumber": 1,
      "startTime": "09:00",
      "endTime": "09:45",
      "subjectId": "69fae2a012627d3790c2e8a1",
      "teacherProfileId": "69fae2a012627d3790c2e8a1",
      "room": "101",
      "label": "Mathematics",
      "isBreak": false
    },
    {
      "dayOfWeek": "MON",
      "periodNumber": 2,
      "startTime": "09:45",
      "endTime": "10:00",
      "label": "Break",
      "isBreak": true
    }
  ]
}
```

**Actual Postman request body**

```json
{
  "query": "mutation ReplaceSectionTimetable($sectionId: ID!, $slots: [TimetableSlotInput!]!) { replaceSectionTimetable(sectionId: $sectionId, slots: $slots) { sectionId slots { id sectionId dayOfWeek periodNumber startTime endTime label isBreak } } }",
  "variables": {
    "sectionId": "69fae2a012627d3790c2e8a1",
    "slots": [
      {
        "dayOfWeek": "MON",
        "periodNumber": 1,
        "startTime": "09:00",
        "endTime": "09:45",
        "subjectId": "69fae2a012627d3790c2e8a1",
        "teacherProfileId": "69fae2a012627d3790c2e8a1",
        "room": "101",
        "label": "Mathematics",
        "isBreak": false
      },
      {
        "dayOfWeek": "MON",
        "periodNumber": 2,
        "startTime": "09:45",
        "endTime": "10:00",
        "label": "Break",
        "isBreak": true
      }
    ]
  }
}
```

**Sample success response**

```json
{
  "data": {
    "replaceSectionTimetable": {
      "sectionId": "69fae2a012627d3790c2e8a1",
      "slots": [
        {
          "id": "69fae2a012627d3790c2e8a1",
          "sectionId": "69fae2a012627d3790c2e8a1",
          "dayOfWeek": "sample",
          "periodNumber": 1,
          "startTime": "09:00",
          "endTime": "09:00",
          "label": "sample",
          "isBreak": true
        }
      ]
    }
  }
}
```

### Get Section Timetable

- Folder: `Academics / Subjects & Timetable Builder`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetSectionTimetable`
- Variables: `sectionId`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "sectionId": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetSectionTimetable($sectionId: ID!) { getSectionTimetable(sectionId: $sectionId) { sectionId slots { id dayOfWeek periodNumber startTime endTime label isBreak } } }",
  "variables": {
    "sectionId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getSectionTimetable": {
      "sectionId": "69fae2a012627d3790c2e8a1",
      "slots": [
        {
          "id": "69fae2a012627d3790c2e8a1",
          "dayOfWeek": "sample",
          "periodNumber": 1,
          "startTime": "09:00",
          "endTime": "09:00",
          "label": "sample",
          "isBreak": true
        }
      ]
    }
  }
}
```

### Get Teacher Timetable

- Folder: `Academics / Subjects & Timetable Builder`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetTeacherTimetable`
- Variables: `profileId`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "profileId": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetTeacherTimetable($profileId: ID!) { getTeacherTimetable(profileId: $profileId) { slots { id sectionId dayOfWeek periodNumber startTime endTime label isBreak } incharges { id role } } }",
  "variables": {
    "profileId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getTeacherTimetable": {
      "slots": [
        {
          "id": "69fae2a012627d3790c2e8a1",
          "sectionId": "69fae2a012627d3790c2e8a1",
          "dayOfWeek": "sample",
          "periodNumber": 1,
          "startTime": "09:00",
          "endTime": "09:00",
          "label": "sample",
          "isBreak": true
        }
      ],
      "incharges": [
        {
          "id": "69fae2a012627d3790c2e8a1",
          "role": "sample"
        }
      ]
    }
  }
}
```

### Enroll Student

- Folder: `Academics / Students`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation EnrollStudent`
- Variables: `input`
- Saves: `student_id`

**Sample input data (readable)**

```json
{
  "input": {
    "firstName": "Arjun",
    "lastName": "Kumar",
    "dateOfBirth": "2010-03-15",
    "gender": "MALE",
    "phone": "9876543210",
    "campusId": "69fae2a012627d3790c2e8a1",
    "academicYearId": "69fae2a012627d3790c2e8a1",
    "classId": "69fae2a012627d3790c2e8a1",
    "sectionId": "69fae2a012627d3790c2e8a1",
    "guardians": [
      {
        "name": "Ravi Kumar",
        "relation": "Father",
        "phone": "9876543211"
      }
    ]
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation EnrollStudent($input: AWSJSON!) { enrollStudent(input: $input) }",
  "variables": {
    "input": "{\"firstName\":\"Arjun\",\"lastName\":\"Kumar\",\"dateOfBirth\":\"2010-03-15\",\"gender\":\"MALE\",\"phone\":\"9876543210\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"academicYearId\":\"69fae2a012627d3790c2e8a1\",\"classId\":\"69fae2a012627d3790c2e8a1\",\"sectionId\":\"69fae2a012627d3790c2e8a1\",\"guardians\":[{\"name\":\"Ravi Kumar\",\"relation\":\"Father\",\"phone\":\"9876543211\"}]}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "enrollStudent": {
      "id": "69fae2a012627d3790c2e8a1",
      "admissionNo": "ADM2026001",
      "registrationNo": "REG2026001",
      "rollNo": "1",
      "fullName": "Sample Student",
      "status": "ACTIVE"
    }
  }
}
```

### Get Student

- Folder: `Academics / Students`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetStudent`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetStudent($id: ID!) { getStudent(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getStudent": {
      "id": "69fae2a012627d3790c2e8a1",
      "admissionNo": "ADM2026001",
      "registrationNo": "REG2026001",
      "rollNo": "1",
      "fullName": "Sample Student",
      "status": "ACTIVE"
    }
  }
}
```

### Update Student

- Folder: `Academics / Students`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation UpdateStudent`
- Variables: `input, studentId`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "studentId": "69fae2a012627d3790c2e8a1",
  "input": {
    "phone": "9876543212"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation UpdateStudent($studentId: ID!, $input: AWSJSON!) { updateStudent(studentId: $studentId, input: $input) }",
  "variables": {
    "studentId": "69fae2a012627d3790c2e8a1",
    "input": "{\"phone\":\"9876543212\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "updateStudent": {
      "id": "69fae2a012627d3790c2e8a1",
      "admissionNo": "ADM2026001",
      "registrationNo": "REG2026001",
      "rollNo": "1",
      "fullName": "Sample Student",
      "status": "ACTIVE"
    }
  }
}
```

### Assign Student to Class

- Folder: `Academics / Students`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation AssignStudentClass`
- Variables: `input, studentId`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "studentId": "69fae2a012627d3790c2e8a1",
  "input": {
    "classId": "69fae2a012627d3790c2e8a1",
    "sectionId": "69fae2a012627d3790c2e8a1",
    "academicYearId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation AssignStudentClass($studentId: ID!, $input: AWSJSON!) { assignStudentClass(studentId: $studentId, input: $input) }",
  "variables": {
    "studentId": "69fae2a012627d3790c2e8a1",
    "input": "{\"classId\":\"69fae2a012627d3790c2e8a1\",\"sectionId\":\"69fae2a012627d3790c2e8a1\",\"academicYearId\":\"69fae2a012627d3790c2e8a1\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "assignStudentClass": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Grade 10",
      "code": "G10",
      "status": "ACTIVE"
    }
  }
}
```

### Update Student Status

- Folder: `Academics / Students`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation UpdateStudentStatus`
- Variables: `status, studentId`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "studentId": "69fae2a012627d3790c2e8a1",
  "status": "ACTIVE"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation UpdateStudentStatus($studentId: ID!, $status: String!) { updateStudentStatus(studentId: $studentId, status: $status) }",
  "variables": {
    "studentId": "69fae2a012627d3790c2e8a1",
    "status": "ACTIVE"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "updateStudentStatus": {
      "id": "69fae2a012627d3790c2e8a1",
      "admissionNo": "ADM2026001",
      "registrationNo": "REG2026001",
      "rollNo": "1",
      "fullName": "Sample Student",
      "status": "ACTIVE"
    }
  }
}
```

### List Students

- Folder: `Academics / Students`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listStudents }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listStudents": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "admissionNo": "ADM2026001",
        "registrationNo": "REG2026001",
        "rollNo": "1",
        "fullName": "Sample Student",
        "status": "ACTIVE"
      }
    ]
  }
}
```

### Generate Registration Numbers

- Folder: `Academics / Registration Numbers`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation GenerateRegistrationNumbers`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "academicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "gradeId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation GenerateRegistrationNumbers($input: AWSJSON!) { generateRegistrationNumbers(input: $input) }",
  "variables": {
    "input": "{\"academicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"gradeId\":\"69fae2a012627d3790c2e8a1\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "generateRegistrationNumbers": {
      "id": "69fae2a012627d3790c2e8a1",
      "status": "ACTIVE",
      "name": "Sample Name"
    }
  }
}
```

### Freeze Registration Numbers

- Folder: `Academics / Registration Numbers`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation FreezeRegistrationNumbers`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "academicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "gradeId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation FreezeRegistrationNumbers($input: AWSJSON!) { freezeRegistrationNumbers(input: $input) }",
  "variables": {
    "input": "{\"academicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"gradeId\":\"69fae2a012627d3790c2e8a1\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "freezeRegistrationNumbers": true
  }
}
```

### List Registration Batches

- Folder: `Academics / Registration Numbers`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listRegistrationBatches(academicYearId: \"69fae2a012627d3790c2e8a1\", campusId: \"69fae2a012627d3790c2e8a1\") }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listRegistrationBatches": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "status": "ACTIVE",
        "name": "Sample Name"
      }
    ]
  }
}
```

### Generate Roll Numbers — Alphabetical

- Folder: `Academics / Roll Numbers`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation GenerateRollNumbers`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "academicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "gradeId": "69fae2a012627d3790c2e8a1",
    "sectionId": "69fae2a012627d3790c2e8a1",
    "generationMode": "ALPHABETICAL"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation GenerateRollNumbers($input: AWSJSON!) { generateRollNumbers(input: $input) }",
  "variables": {
    "input": "{\"academicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"gradeId\":\"69fae2a012627d3790c2e8a1\",\"sectionId\":\"69fae2a012627d3790c2e8a1\",\"generationMode\":\"ALPHABETICAL\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "generateRollNumbers": {
      "id": "69fae2a012627d3790c2e8a1",
      "status": "ACTIVE",
      "name": "Sample Name"
    }
  }
}
```

### Generate Roll Numbers — Sequential

- Folder: `Academics / Roll Numbers`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation GenerateRollNumbers`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "academicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "gradeId": "69fae2a012627d3790c2e8a1",
    "sectionId": "69fae2a012627d3790c2e8a1",
    "generationMode": "SEQUENTIAL"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation GenerateRollNumbers($input: AWSJSON!) { generateRollNumbers(input: $input) }",
  "variables": {
    "input": "{\"academicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"gradeId\":\"69fae2a012627d3790c2e8a1\",\"sectionId\":\"69fae2a012627d3790c2e8a1\",\"generationMode\":\"SEQUENTIAL\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "generateRollNumbers": {
      "id": "69fae2a012627d3790c2e8a1",
      "status": "ACTIVE",
      "name": "Sample Name"
    }
  }
}
```

### Freeze Roll Numbers

- Folder: `Academics / Roll Numbers`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation FreezeRollNumbers`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "academicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "gradeId": "69fae2a012627d3790c2e8a1",
    "sectionId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation FreezeRollNumbers($input: AWSJSON!) { freezeRollNumbers(input: $input) }",
  "variables": {
    "input": "{\"academicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"gradeId\":\"69fae2a012627d3790c2e8a1\",\"sectionId\":\"69fae2a012627d3790c2e8a1\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "freezeRollNumbers": true
  }
}
```

### List Roll Number Batches

- Folder: `Academics / Roll Numbers`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listRollNoBatches(academicYearId: \"69fae2a012627d3790c2e8a1\", campusId: \"69fae2a012627d3790c2e8a1\", sectionId: \"69fae2a012627d3790c2e8a1\") }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listRollNoBatches": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "status": "ACTIVE",
        "name": "Sample Name"
      }
    ]
  }
}
```

### Mark Section Attendance

- Folder: `Academics / Attendance`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation MarkSectionAttendance`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "sectionId": "69fae2a012627d3790c2e8a1",
    "date": "2026-05-06",
    "records": [
      {
        "studentId": "69fae2a012627d3790c2e8a1",
        "status": "PRESENT"
      }
    ]
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation MarkSectionAttendance($input: BulkAttendanceInput!) { markSectionAttendance(input: $input) }",
  "variables": {
    "input": {
      "sectionId": "69fae2a012627d3790c2e8a1",
      "date": "2026-05-06",
      "records": [
        {
          "studentId": "69fae2a012627d3790c2e8a1",
          "status": "PRESENT"
        }
      ]
    }
  }
}
```

**Sample success response**

```json
{
  "data": {
    "markSectionAttendance": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "A",
      "classId": "69fae2a012627d3790c2e8a1",
      "academicYearId": "69fae2a012627d3790c2e8a1",
      "capacity": 40
    }
  }
}
```

### Get Section Attendance (by date)

- Folder: `Academics / Attendance`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetSectionAttendance`
- Variables: `date, sectionId`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "sectionId": "69fae2a012627d3790c2e8a1",
  "date": "2026-05-06"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetSectionAttendance($sectionId: ID!, $date: AWSDate!) { getSectionAttendance(sectionId: $sectionId, date: $date) { studentId status } }",
  "variables": {
    "sectionId": "69fae2a012627d3790c2e8a1",
    "date": "2026-05-06"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getSectionAttendance": {
      "studentId": "69fae2a012627d3790c2e8a1",
      "status": "ACTIVE"
    }
  }
}
```

### Get Attendance Summary (date range)

- Folder: `Academics / Attendance`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetAttendanceSummary`
- Variables: `fromDate, sectionId, toDate`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "sectionId": "69fae2a012627d3790c2e8a1",
  "fromDate": "2025-06-01",
  "toDate": "2025-12-31"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetAttendanceSummary($sectionId: ID!, $fromDate: String!, $toDate: String!) { getSectionAttendanceSummary(sectionId: $sectionId, fromDate: $fromDate, toDate: $toDate) }",
  "variables": {
    "sectionId": "69fae2a012627d3790c2e8a1",
    "fromDate": "2025-06-01",
    "toDate": "2025-12-31"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getSectionAttendanceSummary": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "A",
      "classId": "69fae2a012627d3790c2e8a1",
      "academicYearId": "69fae2a012627d3790c2e8a1",
      "capacity": 40
    }
  }
}
```

### Get Student Attendance (date range)

- Folder: `Academics / Attendance`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetStudentAttendance`
- Variables: `from, studentId, to`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "studentId": "69fae2a012627d3790c2e8a1",
  "from": "2025-06-01",
  "to": "2025-12-31"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetStudentAttendance($studentId: ID!, $from: AWSDate!, $to: AWSDate!) { getStudentAttendance(studentId: $studentId, from: $from, to: $to) { studentId status date } }",
  "variables": {
    "studentId": "69fae2a012627d3790c2e8a1",
    "from": "2025-06-01",
    "to": "2025-12-31"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getStudentAttendance": {
      "studentId": "69fae2a012627d3790c2e8a1",
      "status": "ACTIVE",
      "date": "2026-05-06"
    }
  }
}
```

### Create Exam

- Folder: `Academics / Exams & Results`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CreateExam`
- Variables: `input`
- Saves: `exam_id`

**Sample input data (readable)**

```json
{
  "input": {
    "name": "Term 1 Exam 2025",
    "classId": "69fae2a012627d3790c2e8a1",
    "sectionId": "69fae2a012627d3790c2e8a1",
    "academicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "startDate": "2025-10-15",
    "endDate": "2025-10-20",
    "maxMarks": 100,
    "passingMarks": 35,
    "type": "UNIT_TEST"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CreateExam($input: AWSJSON!) { createExam(input: $input) }",
  "variables": {
    "input": "{\"name\":\"Term 1 Exam 2025\",\"classId\":\"69fae2a012627d3790c2e8a1\",\"sectionId\":\"69fae2a012627d3790c2e8a1\",\"academicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"startDate\":\"2025-10-15\",\"endDate\":\"2025-10-20\",\"maxMarks\":100,\"passingMarks\":35,\"type\":\"UNIT_TEST\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "createExam": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Mid Term",
      "examType": "TERM",
      "status": "DRAFT"
    }
  }
}
```

### List Exams

- Folder: `Academics / Exams & Results`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `exam_id`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listExams(academicYearId: \"69fae2a012627d3790c2e8a1\") }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listExams": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "name": "Mid Term",
        "examType": "TERM",
        "status": "DRAFT"
      }
    ]
  }
}
```

### Get Exam

- Folder: `Academics / Exams & Results`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetExam`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetExam($id: ID!) { getExam(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getExam": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Mid Term",
      "examType": "TERM",
      "status": "DRAFT"
    }
  }
}
```

### Enter Marks (single student)

- Folder: `Academics / Exams & Results`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation EnterMarks`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "examId": "69fae2a012627d3790c2e8a1",
    "studentId": "69fae2a012627d3790c2e8a1",
    "marksObtained": 78,
    "maxMarks": 100,
    "grade": "A",
    "remarks": "Good performance"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation EnterMarks($input: AWSJSON!) { enterMarks(input: $input) }",
  "variables": {
    "input": "{\"examId\":\"69fae2a012627d3790c2e8a1\",\"studentId\":\"69fae2a012627d3790c2e8a1\",\"marksObtained\":78,\"maxMarks\":100,\"grade\":\"A\",\"remarks\":\"Good performance\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "enterMarks": "sample"
  }
}
```

### Get Exam Stats

- Folder: `Academics / Exams & Results`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetExamStats`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetExamStats($id: ID!) { getExamStats(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getExamStats": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Mid Term",
      "examType": "TERM",
      "status": "DRAFT"
    }
  }
}
```

### Get Marks Status

- Folder: `Academics / Exams & Results`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetMarksStatus`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetMarksStatus($id: ID!) { getMarksStatus(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getMarksStatus": {
      "id": "69fae2a012627d3790c2e8a1",
      "status": "ACTIVE",
      "name": "Sample Name"
    }
  }
}
```

### Get Exam Results

- Folder: `Academics / Exams & Results`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetExamResults`
- Variables: `examId`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "examId": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetExamResults($examId: ID!) { getExamResults(examId: $examId) }",
  "variables": {
    "examId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getExamResults": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Mid Term",
      "examType": "TERM",
      "status": "DRAFT"
    }
  }
}
```

### Publish Results

- Folder: `Academics / Exams & Results`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation PublishResults`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation PublishResults($id: ID!) { publishResults(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "publishResults": {
      "id": "69fae2a012627d3790c2e8a1",
      "status": "ACTIVE",
      "name": "Sample Name"
    }
  }
}
```

### List Results (published)

- Folder: `Academics / Exams & Results`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listResults }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listResults": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "status": "ACTIVE",
        "name": "Sample Name"
      }
    ]
  }
}
```

### Update Exam

- Folder: `Academics / Exams & Results`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation UpdateExam`
- Variables: `id, input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1",
  "input": {
    "name": "Term 1 Exam 2025 (Updated)"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation UpdateExam($id: ID!, $input: AWSJSON!) { updateExam(id: $id, input: $input) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1",
    "input": "{\"name\":\"Term 1 Exam 2025 (Updated)\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "updateExam": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Mid Term",
      "examType": "TERM",
      "status": "DRAFT"
    }
  }
}
```

### Delete Exam

- Folder: `Academics / Exams & Results`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation DeleteExam`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation DeleteExam($id: ID!) { deleteExam(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "deleteExam": true
  }
}
```

### Set Promotion Eligibility

- Folder: `Academics / Promotions`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation SetStudentPromotionEligibility`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "academicYearId": "69fae2a012627d3790c2e8a1",
    "updates": [
      {
        "studentId": "69fae2a012627d3790c2e8a1",
        "eligibility": "ELIGIBLE"
      }
    ]
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation SetStudentPromotionEligibility($input: AWSJSON!) { setStudentPromotionEligibility(input: $input) }",
  "variables": {
    "input": "{\"academicYearId\":\"69fae2a012627d3790c2e8a1\",\"updates\":[{\"studentId\":\"69fae2a012627d3790c2e8a1\",\"eligibility\":\"ELIGIBLE\"}]}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "setStudentPromotionEligibility": true
  }
}
```

### Auto-Evaluate Promotion Eligibility

- Folder: `Academics / Promotions`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation AutoEvaluatePromotionEligibility`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "academicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "gradeId": "69fae2a012627d3790c2e8a1",
    "sectionId": "69fae2a012627d3790c2e8a1",
    "minAttendancePct": 75,
    "minAvgMarks": 35
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation AutoEvaluatePromotionEligibility($input: AWSJSON!) { autoEvaluatePromotionEligibility(input: $input) }",
  "variables": {
    "input": "{\"academicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"gradeId\":\"69fae2a012627d3790c2e8a1\",\"sectionId\":\"69fae2a012627d3790c2e8a1\",\"minAttendancePct\":75,\"minAvgMarks\":35}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "autoEvaluatePromotionEligibility": "sample"
  }
}
```

### Promote Students — SAME_SECTION / Skip fee

- Folder: `Academics / Promotions`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation PromoteStudents`
- Variables: `input`
- Saves: `promotion_batch_id`

**Sample input data (readable)**

```json
{
  "input": {
    "fromAcademicYearId": "69fae2a012627d3790c2e8a1",
    "toAcademicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "fromGradeId": "69fae2a012627d3790c2e8a1",
    "toGradeId": "69fae2a012627d3790c2e8a1",
    "studentIds": [
      "69fae2a012627d3790c2e8a1"
    ],
    "sectionStrategy": "SAME_SECTION",
    "eligibilityMode": "USE_ENROLLMENT_ELIGIBILITY",
    "feeAction": "SKIP"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }",
  "variables": {
    "input": "{\"fromAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"toAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"fromGradeId\":\"69fae2a012627d3790c2e8a1\",\"toGradeId\":\"69fae2a012627d3790c2e8a1\",\"studentIds\":[\"69fae2a012627d3790c2e8a1\"],\"sectionStrategy\":\"SAME_SECTION\",\"eligibilityMode\":\"USE_ENROLLMENT_ELIGIBILITY\",\"feeAction\":\"SKIP\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "promoteStudents": {
      "id": "69fae2a012627d3790c2e8a1",
      "admissionNo": "ADM2026001",
      "registrationNo": "REG2026001",
      "rollNo": "1",
      "fullName": "Sample Student",
      "status": "ACTIVE"
    }
  }
}
```

### Promote Students — MANUAL sections / Copy fee pattern

- Folder: `Academics / Promotions`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation PromoteStudents`
- Variables: `input`
- Saves: `promotion_batch_id`

**Sample input data (readable)**

```json
{
  "input": {
    "fromAcademicYearId": "69fae2a012627d3790c2e8a1",
    "toAcademicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "fromGradeId": "69fae2a012627d3790c2e8a1",
    "toGradeId": "69fae2a012627d3790c2e8a1",
    "studentIds": [
      "69fae2a012627d3790c2e8a1"
    ],
    "sectionStrategy": "MANUAL",
    "manualAssignments": [
      {
        "studentId": "69fae2a012627d3790c2e8a1",
        "sectionId": "69fae2a012627d3790c2e8a1"
      }
    ],
    "eligibilityMode": "PROMOTE_ALL",
    "feeAction": "COPY_PATTERN"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }",
  "variables": {
    "input": "{\"fromAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"toAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"fromGradeId\":\"69fae2a012627d3790c2e8a1\",\"toGradeId\":\"69fae2a012627d3790c2e8a1\",\"studentIds\":[\"69fae2a012627d3790c2e8a1\"],\"sectionStrategy\":\"MANUAL\",\"manualAssignments\":[{\"studentId\":\"69fae2a012627d3790c2e8a1\",\"sectionId\":\"69fae2a012627d3790c2e8a1\"}],\"eligibilityMode\":\"PROMOTE_ALL\",\"feeAction\":\"COPY_PATTERN\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "promoteStudents": {
      "id": "69fae2a012627d3790c2e8a1",
      "admissionNo": "ADM2026001",
      "registrationNo": "REG2026001",
      "rollNo": "1",
      "fullName": "Sample Student",
      "status": "ACTIVE"
    }
  }
}
```

### Promote Students — AUTO_SHUFFLE / Assign existing fee

- Folder: `Academics / Promotions`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation PromoteStudents`
- Variables: `input`
- Saves: `promotion_batch_id`

**Sample input data (readable)**

```json
{
  "input": {
    "fromAcademicYearId": "69fae2a012627d3790c2e8a1",
    "toAcademicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "fromGradeId": "69fae2a012627d3790c2e8a1",
    "toGradeId": "69fae2a012627d3790c2e8a1",
    "sectionStrategy": "AUTO_SHUFFLE",
    "eligibilityMode": "PROMOTE_ALL",
    "feeAction": "ASSIGN_EXISTING",
    "feeStructureId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }",
  "variables": {
    "input": "{\"fromAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"toAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"fromGradeId\":\"69fae2a012627d3790c2e8a1\",\"toGradeId\":\"69fae2a012627d3790c2e8a1\",\"sectionStrategy\":\"AUTO_SHUFFLE\",\"eligibilityMode\":\"PROMOTE_ALL\",\"feeAction\":\"ASSIGN_EXISTING\",\"feeStructureId\":\"69fae2a012627d3790c2e8a1\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "promoteStudents": {
      "id": "69fae2a012627d3790c2e8a1",
      "admissionNo": "ADM2026001",
      "registrationNo": "REG2026001",
      "rollNo": "1",
      "fullName": "Sample Student",
      "status": "ACTIVE"
    }
  }
}
```

### Promote Students — GENDER_BALANCE

- Folder: `Academics / Promotions`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation PromoteStudents`
- Variables: `input`
- Saves: `promotion_batch_id`

**Sample input data (readable)**

```json
{
  "input": {
    "fromAcademicYearId": "69fae2a012627d3790c2e8a1",
    "toAcademicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "fromGradeId": "69fae2a012627d3790c2e8a1",
    "toGradeId": "69fae2a012627d3790c2e8a1",
    "sectionStrategy": "GENDER_BALANCE",
    "eligibilityMode": "USE_ENROLLMENT_ELIGIBILITY",
    "feeAction": "SKIP"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }",
  "variables": {
    "input": "{\"fromAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"toAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"fromGradeId\":\"69fae2a012627d3790c2e8a1\",\"toGradeId\":\"69fae2a012627d3790c2e8a1\",\"sectionStrategy\":\"GENDER_BALANCE\",\"eligibilityMode\":\"USE_ENROLLMENT_ELIGIBILITY\",\"feeAction\":\"SKIP\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "promoteStudents": {
      "id": "69fae2a012627d3790c2e8a1",
      "admissionNo": "ADM2026001",
      "registrationNo": "REG2026001",
      "rollNo": "1",
      "fullName": "Sample Student",
      "status": "ACTIVE"
    }
  }
}
```

### Promote Students — CAPACITY_LIMIT

- Folder: `Academics / Promotions`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation PromoteStudents`
- Variables: `input`
- Saves: `promotion_batch_id`

**Sample input data (readable)**

```json
{
  "input": {
    "fromAcademicYearId": "69fae2a012627d3790c2e8a1",
    "toAcademicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "fromGradeId": "69fae2a012627d3790c2e8a1",
    "toGradeId": "69fae2a012627d3790c2e8a1",
    "sectionStrategy": "CAPACITY_LIMIT",
    "sectionCapacity": 40,
    "eligibilityMode": "USE_ENROLLMENT_ELIGIBILITY",
    "feeAction": "SKIP"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }",
  "variables": {
    "input": "{\"fromAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"toAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"fromGradeId\":\"69fae2a012627d3790c2e8a1\",\"toGradeId\":\"69fae2a012627d3790c2e8a1\",\"sectionStrategy\":\"CAPACITY_LIMIT\",\"sectionCapacity\":40,\"eligibilityMode\":\"USE_ENROLLMENT_ELIGIBILITY\",\"feeAction\":\"SKIP\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "promoteStudents": {
      "id": "69fae2a012627d3790c2e8a1",
      "admissionNo": "ADM2026001",
      "registrationNo": "REG2026001",
      "rollNo": "1",
      "fullName": "Sample Student",
      "status": "ACTIVE"
    }
  }
}
```

### Promote Students — PERFORMANCE_RANK (by exam scores)

- Folder: `Academics / Promotions`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation PromoteStudents`
- Variables: `input`
- Saves: `promotion_batch_id`

**Sample input data (readable)**

```json
{
  "input": {
    "fromAcademicYearId": "69fae2a012627d3790c2e8a1",
    "toAcademicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "fromGradeId": "69fae2a012627d3790c2e8a1",
    "toGradeId": "69fae2a012627d3790c2e8a1",
    "sectionStrategy": "PERFORMANCE_RANK",
    "examId": "69fae2a012627d3790c2e8a1",
    "eligibilityMode": "USE_ENROLLMENT_ELIGIBILITY",
    "feeAction": "SKIP"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }",
  "variables": {
    "input": "{\"fromAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"toAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"fromGradeId\":\"69fae2a012627d3790c2e8a1\",\"toGradeId\":\"69fae2a012627d3790c2e8a1\",\"sectionStrategy\":\"PERFORMANCE_RANK\",\"examId\":\"69fae2a012627d3790c2e8a1\",\"eligibilityMode\":\"USE_ENROLLMENT_ELIGIBILITY\",\"feeAction\":\"SKIP\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "promoteStudents": {
      "id": "69fae2a012627d3790c2e8a1",
      "admissionNo": "ADM2026001",
      "registrationNo": "REG2026001",
      "rollNo": "1",
      "fullName": "Sample Student",
      "status": "ACTIVE"
    }
  }
}
```

### Promote Students — SUBJECT_GROUP

- Folder: `Academics / Promotions`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation PromoteStudents`
- Variables: `input`
- Saves: `promotion_batch_id`

**Sample input data (readable)**

```json
{
  "input": {
    "fromAcademicYearId": "69fae2a012627d3790c2e8a1",
    "toAcademicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "fromGradeId": "69fae2a012627d3790c2e8a1",
    "toGradeId": "69fae2a012627d3790c2e8a1",
    "sectionStrategy": "SUBJECT_GROUP",
    "subjectGroupMappings": [
      {
        "subjectId": "69fae2a012627d3790c2e8a1",
        "sectionId": "69fae2a012627d3790c2e8a1"
      }
    ],
    "eligibilityMode": "PROMOTE_ALL",
    "feeAction": "SKIP"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }",
  "variables": {
    "input": "{\"fromAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"toAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"fromGradeId\":\"69fae2a012627d3790c2e8a1\",\"toGradeId\":\"69fae2a012627d3790c2e8a1\",\"sectionStrategy\":\"SUBJECT_GROUP\",\"subjectGroupMappings\":[{\"subjectId\":\"69fae2a012627d3790c2e8a1\",\"sectionId\":\"69fae2a012627d3790c2e8a1\"}],\"eligibilityMode\":\"PROMOTE_ALL\",\"feeAction\":\"SKIP\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "promoteStudents": {
      "id": "69fae2a012627d3790c2e8a1",
      "admissionNo": "ADM2026001",
      "registrationNo": "REG2026001",
      "rollNo": "1",
      "fullName": "Sample Student",
      "status": "ACTIVE"
    }
  }
}
```

### Promote Students — TRANSPORT_ROUTE

- Folder: `Academics / Promotions`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation PromoteStudents`
- Variables: `input`
- Saves: `promotion_batch_id`

**Sample input data (readable)**

```json
{
  "input": {
    "fromAcademicYearId": "69fae2a012627d3790c2e8a1",
    "toAcademicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "fromGradeId": "69fae2a012627d3790c2e8a1",
    "toGradeId": "69fae2a012627d3790c2e8a1",
    "sectionStrategy": "TRANSPORT_ROUTE",
    "eligibilityMode": "USE_ENROLLMENT_ELIGIBILITY",
    "feeAction": "SKIP"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }",
  "variables": {
    "input": "{\"fromAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"toAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"fromGradeId\":\"69fae2a012627d3790c2e8a1\",\"toGradeId\":\"69fae2a012627d3790c2e8a1\",\"sectionStrategy\":\"TRANSPORT_ROUTE\",\"eligibilityMode\":\"USE_ENROLLMENT_ELIGIBILITY\",\"feeAction\":\"SKIP\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "promoteStudents": {
      "id": "69fae2a012627d3790c2e8a1",
      "admissionNo": "ADM2026001",
      "registrationNo": "REG2026001",
      "rollNo": "1",
      "fullName": "Sample Student",
      "status": "ACTIVE"
    }
  }
}
```

### Promote Students — EXCEL_IMPORT (pre-uploaded file)

- Folder: `Academics / Promotions`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation PromoteStudents`
- Variables: `input`
- Saves: `promotion_batch_id`

**Sample input data (readable)**

```json
{
  "input": {
    "fromAcademicYearId": "69fae2a012627d3790c2e8a1",
    "toAcademicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "fromGradeId": "69fae2a012627d3790c2e8a1",
    "toGradeId": "69fae2a012627d3790c2e8a1",
    "sectionStrategy": "EXCEL_IMPORT",
    "importFileKey": "promotions/section-map.csv",
    "eligibilityMode": "USE_ENROLLMENT_ELIGIBILITY",
    "feeAction": "SKIP"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }",
  "variables": {
    "input": "{\"fromAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"toAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"fromGradeId\":\"69fae2a012627d3790c2e8a1\",\"toGradeId\":\"69fae2a012627d3790c2e8a1\",\"sectionStrategy\":\"EXCEL_IMPORT\",\"importFileKey\":\"promotions/section-map.csv\",\"eligibilityMode\":\"USE_ENROLLMENT_ELIGIBILITY\",\"feeAction\":\"SKIP\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "promoteStudents": {
      "id": "69fae2a012627d3790c2e8a1",
      "admissionNo": "ADM2026001",
      "registrationNo": "REG2026001",
      "rollNo": "1",
      "fullName": "Sample Student",
      "status": "ACTIVE"
    }
  }
}
```

### List Promotion Batches

- Folder: `Academics / Promotions`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `promotion_batch_id`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listPromotionBatches(fromAcademicYearId: \"69fae2a012627d3790c2e8a1\") }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listPromotionBatches": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "status": "COMPLETED",
        "promotedCount": 1,
        "skippedCount": 0
      }
    ]
  }
}
```

### Get Promotion Batch

- Folder: `Academics / Promotions`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetPromotionBatch`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetPromotionBatch($id: ID!) { getPromotionBatch(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getPromotionBatch": {
      "id": "69fae2a012627d3790c2e8a1",
      "status": "COMPLETED",
      "promotedCount": 1,
      "skippedCount": 0
    }
  }
}
```

### List Promotion Batch Items

- Folder: `Academics / Promotions`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listPromotionBatchItems(id: \"69fae2a012627d3790c2e8a1\") }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listPromotionBatchItems": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "status": "COMPLETED",
        "promotedCount": 1,
        "skippedCount": 0
      }
    ]
  }
}
```

### Rollback Promotion Batch

- Folder: `Academics / Promotions`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation RollbackPromotionBatch`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation RollbackPromotionBatch($id: ID!) { rollbackPromotionBatch(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "rollbackPromotionBatch": "sample"
  }
}
```


## Admissions

### Create Enquiry

- Folder: `Admissions / Enquiries`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CreateEnquiry`
- Variables: `input`
- Saves: `enquiry_id`

**Sample input data (readable)**

```json
{
  "input": {
    "studentName": "Rahul Sharma",
    "phone": "9876543210",
    "email": "rahul@example.com",
    "campusId": "69fae2a012627d3790c2e8a1",
    "academicYearId": "69fae2a012627d3790c2e8a1",
    "source": "WALK_IN"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CreateEnquiry($input: AWSJSON!) { createEnquiry(input: $input) }",
  "variables": {
    "input": "{\"studentName\":\"Rahul Sharma\",\"phone\":\"9876543210\",\"email\":\"rahul@example.com\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"academicYearId\":\"69fae2a012627d3790c2e8a1\",\"source\":\"WALK_IN\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "createEnquiry": {
      "id": "69fae2a012627d3790c2e8a1",
      "enquiryNo": "ENQ2026001",
      "studentName": "Sample Student",
      "status": "NEW"
    }
  }
}
```

### List Enquiries

- Folder: `Admissions / Enquiries`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `enquiry_id`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listEnquiries }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listEnquiries": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "status": "ACTIVE",
        "name": "Sample Name"
      }
    ]
  }
}
```

### Get Enquiry

- Folder: `Admissions / Enquiries`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetEnquiry`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetEnquiry($id: ID!) { getEnquiry(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getEnquiry": {
      "id": "69fae2a012627d3790c2e8a1",
      "enquiryNo": "ENQ2026001",
      "studentName": "Sample Student",
      "status": "NEW"
    }
  }
}
```

### Update Enquiry

- Folder: `Admissions / Enquiries`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation UpdateEnquiry`
- Variables: `id, input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1",
  "input": {
    "status": "CONTACTED",
    "notes": "Called and confirmed interest"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation UpdateEnquiry($id: ID!, $input: AWSJSON!) { updateEnquiry(id: $id, input: $input) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1",
    "input": "{\"status\":\"CONTACTED\",\"notes\":\"Called and confirmed interest\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "updateEnquiry": {
      "id": "69fae2a012627d3790c2e8a1",
      "enquiryNo": "ENQ2026001",
      "studentName": "Sample Student",
      "status": "NEW"
    }
  }
}
```

### Duplicate Check

- Folder: `Admissions / Enquiries`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CheckDuplicate`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "phone": "9876543210",
    "email": "rahul@example.com"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CheckDuplicate($input: AWSJSON!) { checkDuplicate(input: $input) }",
  "variables": {
    "input": "{\"phone\":\"9876543210\",\"email\":\"rahul@example.com\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "checkDuplicate": "sample"
  }
}
```

### Admissions Stats

- Folder: `Admissions / Enquiries`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { admissionsStats }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "admissionsStats": {
      "total": 1,
      "items": [
        {
          "id": "69fae2a012627d3790c2e8a1",
          "status": "ACTIVE"
        }
      ]
    }
  }
}
```

### Delete Enquiry

- Folder: `Admissions / Enquiries`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation DeleteEnquiry`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation DeleteEnquiry($id: ID!) { deleteEnquiry(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "deleteEnquiry": true
  }
}
```

### Create Application

- Folder: `Admissions / Applications`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CreateApplication`
- Variables: `input`
- Saves: `application_id`

**Sample input data (readable)**

```json
{
  "input": {
    "studentName": "Priya Patel",
    "phone": "9876500001",
    "email": "priya@example.com",
    "campusId": "69fae2a012627d3790c2e8a1",
    "academicYearId": "69fae2a012627d3790c2e8a1",
    "programId": "69fae2a012627d3790c2e8a1",
    "enquiryId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CreateApplication($input: AWSJSON!) { createApplication(input: $input) }",
  "variables": {
    "input": "{\"studentName\":\"Priya Patel\",\"phone\":\"9876500001\",\"email\":\"priya@example.com\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"academicYearId\":\"69fae2a012627d3790c2e8a1\",\"programId\":\"69fae2a012627d3790c2e8a1\",\"enquiryId\":\"69fae2a012627d3790c2e8a1\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "createApplication": {
      "id": "69fae2a012627d3790c2e8a1",
      "applicationNo": "APP2026001",
      "status": "APPROVED"
    }
  }
}
```

### List Applications

- Folder: `Admissions / Applications`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `application_id`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listApplications }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listApplications": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "applicationNo": "APP2026001",
        "status": "APPROVED"
      }
    ]
  }
}
```

### Get Application

- Folder: `Admissions / Applications`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetApplication`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetApplication($id: ID!) { getApplication(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getApplication": {
      "id": "69fae2a012627d3790c2e8a1",
      "applicationNo": "APP2026001",
      "status": "APPROVED"
    }
  }
}
```

### Get Approval Queue

- Folder: `Admissions / Applications`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { getApprovalQueue }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "getApprovalQueue": {
      "total": 1,
      "items": [
        {
          "id": "69fae2a012627d3790c2e8a1",
          "status": "ACTIVE"
        }
      ]
    }
  }
}
```

### Submit Application

- Folder: `Admissions / Applications`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation SubmitApplication`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation SubmitApplication($id: ID!) { submitApplication(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "submitApplication": {
      "id": "69fae2a012627d3790c2e8a1",
      "applicationNo": "APP2026001",
      "status": "APPROVED"
    }
  }
}
```

### Review Application (mark Under Review)

- Folder: `Admissions / Applications`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation ReviewApplication`
- Variables: `id, input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1",
  "input": {
    "decision": "UNDER_REVIEW",
    "remarks": "Documents verified, proceeding to review"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation ReviewApplication($id: ID!, $input: AWSJSON!) { reviewApplication(id: $id, input: $input) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1",
    "input": "{\"decision\":\"UNDER_REVIEW\",\"remarks\":\"Documents verified, proceeding to review\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "reviewApplication": {
      "id": "69fae2a012627d3790c2e8a1",
      "applicationNo": "APP2026001",
      "status": "APPROVED"
    }
  }
}
```

### Get Application Reviews

- Folder: `Admissions / Applications`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetApplicationReviews`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetApplicationReviews($id: ID!) { getApplicationReviews(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getApplicationReviews": {
      "id": "69fae2a012627d3790c2e8a1",
      "applicationNo": "APP2026001",
      "status": "APPROVED"
    }
  }
}
```

### Approve Application

- Folder: `Admissions / Applications`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation ApproveApplication`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation ApproveApplication($id: ID!) { approveApplication(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "approveApplication": {
      "id": "69fae2a012627d3790c2e8a1",
      "applicationNo": "APP2026001",
      "status": "APPROVED"
    }
  }
}
```

### Reject Application

- Folder: `Admissions / Applications`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation RejectApplication`
- Variables: `id, reason`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1",
  "reason": "Documents incomplete"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation RejectApplication($id: ID!, $reason: String) { rejectApplication(id: $id, reason: $reason) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1",
    "reason": "Documents incomplete"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "rejectApplication": "sample"
  }
}
```

### Verify Document

- Folder: `Admissions / Applications`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation VerifyDocument`
- Variables: `docKey, id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1",
  "docKey": "birth_certificate"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation VerifyDocument($id: ID!, $docKey: String!) { verifyDocument(id: $id, docKey: $docKey) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1",
    "docKey": "birth_certificate"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "verifyDocument": "sample"
  }
}
```

### Withdraw Application

- Folder: `Admissions / Applications`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation WithdrawApplication`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation WithdrawApplication($id: ID!) { withdrawApplication(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "withdrawApplication": "sample"
  }
}
```


## Audit & Cleanup

### List Audit Logs

- Folder: `Audit & Cleanup`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listAuditLogs(limit: 20) }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listAuditLogs": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "status": "ACTIVE",
        "name": "Sample Name"
      }
    ]
  }
}
```

### Duplicate Student Report

- Folder: `Audit & Cleanup`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { getDuplicateStudentReport }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "getDuplicateStudentReport": {
      "id": "69fae2a012627d3790c2e8a1",
      "admissionNo": "ADM2026001",
      "registrationNo": "REG2026001",
      "rollNo": "1",
      "fullName": "Sample Student",
      "status": "ACTIVE"
    }
  }
}
```

### Merge Students

- Folder: `Audit & Cleanup`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation MergeStudents`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "primaryStudentId": "69fae2a012627d3790c2e8a1",
    "duplicateStudentIds": []
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation MergeStudents($input: AWSJSON!) { mergeStudents(input: $input) }",
  "variables": {
    "input": "{\"primaryStudentId\":\"69fae2a012627d3790c2e8a1\",\"duplicateStudentIds\":[]}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "mergeStudents": "sample"
  }
}
```


## Auth (Cognito)

### Get Token — User+Password

- Folder: `Auth (Cognito)`
- Method: `POST`
- URL: `https://cognito-idp.ap-south-1.amazonaws.com/`
- Kind: `JSON`
- Operation: `AWSCognitoIdentityProviderService.InitiateAuth`
- Variables: `AuthFlow, AuthParameters, ClientId`
- Saves: `access_token, id_token, refresh_token`

**Sample input data (readable)**

```json
{
  "AuthFlow": "USER_PASSWORD_AUTH",
  "ClientId": "<cognito-client-id>",
  "AuthParameters": {
    "USERNAME": "admin@example.com",
    "PASSWORD": "<redacted>"
  }
}
```

**Actual Postman request body**

```json
{
  "AuthFlow": "USER_PASSWORD_AUTH",
  "ClientId": "<cognito-client-id>",
  "AuthParameters": {
    "USERNAME": "admin@example.com",
    "PASSWORD": "<redacted>"
  }
}
```

**Sample success response**

```json
{
  "AuthenticationResult": {
    "AccessToken": "<redacted>",
    "IdToken": "<redacted>",
    "RefreshToken": "<redacted>",
    "ExpiresIn": 3600,
    "TokenType": "<redacted>"
  }
}
```

### Forgot Password — Send Code

- Folder: `Auth (Cognito)`
- Method: `POST`
- URL: `https://cognito-idp.ap-south-1.amazonaws.com/`
- Kind: `JSON`
- Operation: `AWSCognitoIdentityProviderService.ForgotPassword`
- Variables: `ClientId, Username`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "ClientId": "<cognito-client-id>",
  "Username": "admin@example.com"
}
```

**Actual Postman request body**

```json
{
  "ClientId": "<cognito-client-id>",
  "Username": "admin@example.com"
}
```

**Sample success response**

```json
{
  "CodeDeliveryDetails": {
    "Destination": "u***@example.com",
    "DeliveryMedium": "EMAIL",
    "AttributeName": "email"
  }
}
```

### Confirm Forgot Password — Reset

- Folder: `Auth (Cognito)`
- Method: `POST`
- URL: `https://cognito-idp.ap-south-1.amazonaws.com/`
- Kind: `JSON`
- Operation: `AWSCognitoIdentityProviderService.ConfirmForgotPassword`
- Variables: `ClientId, ConfirmationCode, Password, Username`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "ClientId": "<cognito-client-id>",
  "Username": "admin@example.com",
  "ConfirmationCode": "123456",
  "Password": "<redacted>"
}
```

**Actual Postman request body**

```json
{
  "ClientId": "<cognito-client-id>",
  "Username": "admin@example.com",
  "ConfirmationCode": "123456",
  "Password": "<redacted>"
}
```

**Sample success response**

```json
{
  "CodeDeliveryDetails": {
    "Destination": "u***@example.com",
    "DeliveryMedium": "EMAIL",
    "AttributeName": "email"
  }
}
```

### Change Password — Logged In

- Folder: `Auth (Cognito)`
- Method: `POST`
- URL: `https://cognito-idp.ap-south-1.amazonaws.com/`
- Kind: `JSON`
- Operation: `AWSCognitoIdentityProviderService.ChangePassword`
- Variables: `AccessToken, PreviousPassword, ProposedPassword`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "AccessToken": "<redacted>",
  "PreviousPassword": "<redacted>",
  "ProposedPassword": "<redacted>"
}
```

**Actual Postman request body**

```json
{
  "AccessToken": "<redacted>",
  "PreviousPassword": "<redacted>",
  "ProposedPassword": "<redacted>"
}
```

**Sample success response**

```json
{}
```

### Refresh Token

- Folder: `Auth (Cognito)`
- Method: `POST`
- URL: `https://cognito-idp.ap-south-1.amazonaws.com/`
- Kind: `JSON`
- Operation: `AWSCognitoIdentityProviderService.InitiateAuth`
- Variables: `AuthFlow, AuthParameters, ClientId`
- Saves: `access_token, id_token`

**Sample input data (readable)**

```json
{
  "AuthFlow": "REFRESH_TOKEN_AUTH",
  "ClientId": "<cognito-client-id>",
  "AuthParameters": {
    "REFRESH_TOKEN": "<redacted>"
  }
}
```

**Actual Postman request body**

```json
{
  "AuthFlow": "REFRESH_TOKEN_AUTH",
  "ClientId": "<cognito-client-id>",
  "AuthParameters": {
    "REFRESH_TOKEN": "<redacted>"
  }
}
```

**Sample success response**

```json
{
  "AuthenticationResult": {
    "AccessToken": "<redacted>",
    "IdToken": "<redacted>",
    "RefreshToken": "<redacted>",
    "ExpiresIn": 3600,
    "TokenType": "<redacted>"
  }
}
```


## Comms

### Create Announcement

- Folder: `Comms`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CreateAnnouncement`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "title": "School Notice — Test",
    "content": "This is a test announcement.",
    "campusId": "69fae2a012627d3790c2e8a1",
    "targetAudience": "ALL"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CreateAnnouncement($input: AWSJSON!) { createAnnouncement(input: $input) }",
  "variables": {
    "input": "{\"title\":\"School Notice — Test\",\"content\":\"This is a test announcement.\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"targetAudience\":\"ALL\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "createAnnouncement": {
      "id": "69fae2a012627d3790c2e8a1",
      "title": "Sample Notice",
      "status": "ACTIVE"
    }
  }
}
```

### List Announcements

- Folder: `Comms`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listAnnouncements }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listAnnouncements": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "title": "Sample Notice",
        "status": "ACTIVE"
      }
    ]
  }
}
```

### List Events

- Folder: `Comms`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listEvents }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listEvents": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "title": "Sample Notice",
        "status": "ACTIVE"
      }
    ]
  }
}
```

### List Leave Requests

- Folder: `Comms`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listLeaveRequests }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listLeaveRequests": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "title": "Sample Notice",
        "status": "ACTIVE"
      }
    ]
  }
}
```


## Finance

### Create Fee Category

- Folder: `Finance / Fee Categories`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CreateFeeCategory`
- Variables: `input`
- Saves: `fee_category_id`

**Sample input data (readable)**

```json
{
  "input": {
    "name": "General Fees",
    "moduleType": "FEE",
    "feeType": "GENERAL",
    "invoicePrefix": "GF/INV",
    "receiptPrefix": "GF/REC",
    "defaultAllocationMethod": "PRO_RATA"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CreateFeeCategory($input: AWSJSON!) { createFeeCategory(input: $input) }",
  "variables": {
    "input": "{\"name\":\"General Fees\",\"moduleType\":\"FEE\",\"feeType\":\"GENERAL\",\"invoicePrefix\":\"GF/INV\",\"receiptPrefix\":\"GF/REC\",\"defaultAllocationMethod\":\"PRO_RATA\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "createFeeCategory": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Tuition Fee",
      "amount": 1000,
      "status": "ACTIVE"
    }
  }
}
```

### Get Fee Category

- Folder: `Finance / Fee Categories`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetFeeCategory`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetFeeCategory($id: ID!) { getFeeCategory(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getFeeCategory": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Tuition Fee",
      "amount": 1000,
      "status": "ACTIVE"
    }
  }
}
```

### Update Fee Category

- Folder: `Finance / Fee Categories`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation UpdateFeeCategory`
- Variables: `id, input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1",
  "input": {
    "defaultAllocationMethod": "PRO_RATA"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation UpdateFeeCategory($id: ID!, $input: AWSJSON!) { updateFeeCategory(id: $id, input: $input) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1",
    "input": "{\"defaultAllocationMethod\":\"PRO_RATA\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "updateFeeCategory": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Tuition Fee",
      "amount": 1000,
      "status": "ACTIVE"
    }
  }
}
```

### List Fee Categories

- Folder: `Finance / Fee Categories`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `fee_category_id`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listFeeCategories }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listFeeCategories": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "name": "Tuition Fee",
        "amount": 1000,
        "status": "ACTIVE"
      }
    ]
  }
}
```

### Delete Fee Category

- Folder: `Finance / Fee Categories`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation DeleteFeeCategory`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation DeleteFeeCategory($id: ID!) { deleteFeeCategory(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "deleteFeeCategory": true
  }
}
```

### Create Fee Head

- Folder: `Finance / Fee Heads`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CreateFeeHead`
- Variables: `input`
- Saves: `fee_head_id`

**Sample input data (readable)**

```json
{
  "input": {
    "name": "Tuition Fee",
    "prefix": "TF",
    "type": "RECURRING",
    "feeCategoryId": "69fae2a012627d3790c2e8a1",
    "isMandatory": true,
    "isRefundable": false,
    "priorityOrder": 1
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CreateFeeHead($input: AWSJSON!) { createFeeHead(input: $input) }",
  "variables": {
    "input": "{\"name\":\"Tuition Fee\",\"prefix\":\"TF\",\"type\":\"RECURRING\",\"feeCategoryId\":\"69fae2a012627d3790c2e8a1\",\"isMandatory\":true,\"isRefundable\":false,\"priorityOrder\":1}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "createFeeHead": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Tuition Fee",
      "amount": 1000,
      "status": "ACTIVE"
    }
  }
}
```

### Update Fee Head

- Folder: `Finance / Fee Heads`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation UpdateFeeHead`
- Variables: `id, input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1",
  "input": {
    "priorityOrder": 1
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation UpdateFeeHead($id: ID!, $input: AWSJSON!) { updateFeeHead(id: $id, input: $input) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1",
    "input": "{\"priorityOrder\":1}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "updateFeeHead": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Tuition Fee",
      "amount": 1000,
      "status": "ACTIVE"
    }
  }
}
```

### List Fee Heads

- Folder: `Finance / Fee Heads`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `fee_head_id`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listFeeHeads }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listFeeHeads": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "name": "Tuition Fee",
        "amount": 1000,
        "status": "ACTIVE"
      }
    ]
  }
}
```

### Delete Fee Head

- Folder: `Finance / Fee Heads`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation DeleteFeeHead`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation DeleteFeeHead($id: ID!) { deleteFeeHead(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "deleteFeeHead": true
  }
}
```

### Create Fee Schedule

- Folder: `Finance / Fee Schedules`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CreateFeeSchedule`
- Variables: `input`
- Saves: `fee_schedule_id`

**Sample input data (readable)**

```json
{
  "input": {
    "name": "Annual Plan 2025-26",
    "academicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "feeCategoryId": "69fae2a012627d3790c2e8a1",
    "collectionType": "PARTIAL_ALLOWED",
    "allowPartialPayment": true,
    "graceDays": 5,
    "slots": [
      {
        "name": "Term 1",
        "dueDate": "2025-07-31",
        "percentOfTotal": 50
      },
      {
        "name": "Term 2",
        "dueDate": "2025-12-31",
        "percentOfTotal": 50
      }
    ]
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CreateFeeSchedule($input: AWSJSON!) { createFeeSchedule(input: $input) }",
  "variables": {
    "input": "{\"name\":\"Annual Plan 2025-26\",\"academicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"feeCategoryId\":\"69fae2a012627d3790c2e8a1\",\"collectionType\":\"PARTIAL_ALLOWED\",\"allowPartialPayment\":true,\"graceDays\":5,\"slots\":[{\"name\":\"Term 1\",\"dueDate\":\"2025-07-31\",\"percentOfTotal\":50},{\"name\":\"Term 2\",\"dueDate\":\"2025-12-31\",\"percentOfTotal\":50}]}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "createFeeSchedule": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Tuition Fee",
      "amount": 1000,
      "status": "ACTIVE"
    }
  }
}
```

### Update Fee Schedule

- Folder: `Finance / Fee Schedules`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation UpdateFeeSchedule`
- Variables: `id, input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1",
  "input": {
    "graceDays": 7
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation UpdateFeeSchedule($id: ID!, $input: AWSJSON!) { updateFeeSchedule(id: $id, input: $input) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1",
    "input": "{\"graceDays\":7}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "updateFeeSchedule": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Tuition Fee",
      "amount": 1000,
      "status": "ACTIVE"
    }
  }
}
```

### List Fee Schedules

- Folder: `Finance / Fee Schedules`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listFeeSchedules }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listFeeSchedules": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "name": "Tuition Fee",
        "amount": 1000,
        "status": "ACTIVE"
      }
    ]
  }
}
```

### Delete Fee Schedule

- Folder: `Finance / Fee Schedules`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation DeleteFeeSchedule`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation DeleteFeeSchedule($id: ID!) { deleteFeeSchedule(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "deleteFeeSchedule": true
  }
}
```

### Create Fee Structure

- Folder: `Finance / Fee Structures`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CreateFeeStructure`
- Variables: `input`
- Saves: `fee_structure_id`

**Sample input data (readable)**

```json
{
  "input": {
    "name": "Grade 10 Annual Fee 2025-26",
    "campusId": "69fae2a012627d3790c2e8a1",
    "academicYearId": "69fae2a012627d3790c2e8a1",
    "classId": "69fae2a012627d3790c2e8a1",
    "feeCategoryId": "69fae2a012627d3790c2e8a1",
    "feeScheduleId": "69fae2a012627d3790c2e8a1",
    "allocationMethod": "PRO_RATA",
    "components": [
      {
        "feeHeadId": "69fae2a012627d3790c2e8a1",
        "feeHeadName": "Tuition Fee",
        "amount": 50000,
        "isOptional": false,
        "priorityOrder": 1
      }
    ]
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CreateFeeStructure($input: AWSJSON!) { createFeeStructure(input: $input) }",
  "variables": {
    "input": "{\"name\":\"Grade 10 Annual Fee 2025-26\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"academicYearId\":\"69fae2a012627d3790c2e8a1\",\"classId\":\"69fae2a012627d3790c2e8a1\",\"feeCategoryId\":\"69fae2a012627d3790c2e8a1\",\"feeScheduleId\":\"69fae2a012627d3790c2e8a1\",\"allocationMethod\":\"PRO_RATA\",\"components\":[{\"feeHeadId\":\"69fae2a012627d3790c2e8a1\",\"feeHeadName\":\"Tuition Fee\",\"amount\":50000,\"isOptional\":false,\"priorityOrder\":1}]}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "createFeeStructure": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Tuition Fee",
      "amount": 1000,
      "status": "ACTIVE"
    }
  }
}
```

### Get Fee Structure

- Folder: `Finance / Fee Structures`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetFeeStructure`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetFeeStructure($id: ID!) { getFeeStructure(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getFeeStructure": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Tuition Fee",
      "amount": 1000,
      "status": "ACTIVE"
    }
  }
}
```

### Update Fee Structure

- Folder: `Finance / Fee Structures`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation UpdateFeeStructure`
- Variables: `id, input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1",
  "input": {
    "name": "Grade 10 Annual Fee 2025-26"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation UpdateFeeStructure($id: ID!, $input: AWSJSON!) { updateFeeStructure(id: $id, input: $input) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1",
    "input": "{\"name\":\"Grade 10 Annual Fee 2025-26\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "updateFeeStructure": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Tuition Fee",
      "amount": 1000,
      "status": "ACTIVE"
    }
  }
}
```

### List Fee Structures

- Folder: `Finance / Fee Structures`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listFeeStructures(academicYearId: \"69fae2a012627d3790c2e8a1\") }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listFeeStructures": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "name": "Tuition Fee",
        "amount": 1000,
        "status": "ACTIVE"
      }
    ]
  }
}
```

### Copy Fee Pattern to Next Year

- Folder: `Finance / Fee Structures`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CopyFeePattern`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "fromAcademicYearId": "69fae2a012627d3790c2e8a1",
    "toAcademicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CopyFeePattern($input: AWSJSON!) { copyFeePattern(input: $input) }",
  "variables": {
    "input": "{\"fromAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"toAcademicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "copyFeePattern": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Tuition Fee",
      "amount": 1000,
      "status": "ACTIVE"
    }
  }
}
```

### Delete Fee Structure

- Folder: `Finance / Fee Structures`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation DeleteFeeStructure`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation DeleteFeeStructure($id: ID!) { deleteFeeStructure(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "deleteFeeStructure": true
  }
}
```

### Get Fee Assignment Queue

- Folder: `Finance / Fee Assignments`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { getFeeAssignmentQueue(academicYearId: \"69fae2a012627d3790c2e8a1\", campusId: \"69fae2a012627d3790c2e8a1\") }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "getFeeAssignmentQueue": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Tuition Fee",
      "amount": 1000,
      "status": "ACTIVE"
    }
  }
}
```

### Assign Fee Structure

- Folder: `Finance / Fee Assignments`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CreateFeeAssignment`
- Variables: `input`
- Saves: `fee_assignment_id`

**Sample input data (readable)**

```json
{
  "input": {
    "studentId": "69fae2a012627d3790c2e8a1",
    "feeStructureId": "69fae2a012627d3790c2e8a1",
    "academicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CreateFeeAssignment($input: AWSJSON!) { createFeeAssignment(input: $input) }",
  "variables": {
    "input": "{\"studentId\":\"69fae2a012627d3790c2e8a1\",\"feeStructureId\":\"69fae2a012627d3790c2e8a1\",\"academicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "createFeeAssignment": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Tuition Fee",
      "amount": 1000,
      "status": "ACTIVE"
    }
  }
}
```

### Get Student Fee Assignment

- Folder: `Finance / Fee Assignments`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetStudentFeeAssignment`
- Variables: `academicYearId, studentId`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "studentId": "69fae2a012627d3790c2e8a1",
  "academicYearId": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetStudentFeeAssignment($studentId: ID!, $academicYearId: ID!) { getStudentFeeAssignment(studentId: $studentId, academicYearId: $academicYearId) }",
  "variables": {
    "studentId": "69fae2a012627d3790c2e8a1",
    "academicYearId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getStudentFeeAssignment": {
      "id": "69fae2a012627d3790c2e8a1",
      "admissionNo": "ADM2026001",
      "registrationNo": "REG2026001",
      "rollNo": "1",
      "fullName": "Sample Student",
      "status": "ACTIVE"
    }
  }
}
```

### Bulk Assign Fee Structure

- Folder: `Finance / Fee Assignments`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation BulkAssignFeeStructure`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "studentIds": [
      "69fae2a012627d3790c2e8a1"
    ],
    "feeStructureId": "69fae2a012627d3790c2e8a1",
    "academicYearId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation BulkAssignFeeStructure($input: AWSJSON!) { bulkAssignFeeStructure(input: $input) }",
  "variables": {
    "input": "{\"studentIds\":[\"69fae2a012627d3790c2e8a1\"],\"feeStructureId\":\"69fae2a012627d3790c2e8a1\",\"academicYearId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "bulkAssignFeeStructure": "sample"
  }
}
```

### List Fee Assignments

- Folder: `Finance / Fee Assignments`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listFeeAssignments(academicYearId: \"69fae2a012627d3790c2e8a1\") }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listFeeAssignments": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "name": "Tuition Fee",
        "amount": 1000,
        "status": "ACTIVE"
      }
    ]
  }
}
```

### Get Fee Assignment

- Folder: `Finance / Fee Assignments`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetFeeAssignment`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetFeeAssignment($id: ID!) { getFeeAssignment(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getFeeAssignment": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Tuition Fee",
      "amount": 1000,
      "status": "ACTIVE"
    }
  }
}
```

### Get Student Invoices

- Folder: `Finance / Invoices`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `invoice_id`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { getStudentInvoices(studentId: \"69fae2a012627d3790c2e8a1\") }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "getStudentInvoices": {
      "id": "69fae2a012627d3790c2e8a1",
      "admissionNo": "ADM2026001",
      "registrationNo": "REG2026001",
      "rollNo": "1",
      "fullName": "Sample Student",
      "status": "ACTIVE"
    }
  }
}
```

### List Invoices

- Folder: `Finance / Invoices`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `invoice_id`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listInvoices(academicYearId: \"69fae2a012627d3790c2e8a1\") }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listInvoices": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "invoiceNo": "INV2026001",
        "totalAmount": 1000,
        "balanceAmount": 1000,
        "status": "ISSUED"
      }
    ]
  }
}
```

### Get Invoice

- Folder: `Finance / Invoices`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetInvoice`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetInvoice($id: ID!) { getInvoice(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getInvoice": {
      "id": "69fae2a012627d3790c2e8a1",
      "invoiceNo": "INV2026001",
      "totalAmount": 1000,
      "balanceAmount": 1000,
      "status": "ISSUED"
    }
  }
}
```

### Student Dues

- Folder: `Finance / Invoices`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { getStudentDues(studentId: \"69fae2a012627d3790c2e8a1\") }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "getStudentDues": {
      "id": "69fae2a012627d3790c2e8a1",
      "admissionNo": "ADM2026001",
      "registrationNo": "REG2026001",
      "rollNo": "1",
      "fullName": "Sample Student",
      "status": "ACTIVE"
    }
  }
}
```

### Create One-off Charge

- Folder: `Finance / Invoices`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CreateOneOffCharge`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "studentId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "academicYearId": "69fae2a012627d3790c2e8a1",
    "classId": "69fae2a012627d3790c2e8a1",
    "amount": 500,
    "description": "Library fine",
    "feeHeadId": "69fae2a012627d3790c2e8a1",
    "feeHeadName": "Tuition Fee"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CreateOneOffCharge($input: AWSJSON!) { createOneOffCharge(input: $input) }",
  "variables": {
    "input": "{\"studentId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"academicYearId\":\"69fae2a012627d3790c2e8a1\",\"classId\":\"69fae2a012627d3790c2e8a1\",\"amount\":500,\"description\":\"Library fine\",\"feeHeadId\":\"69fae2a012627d3790c2e8a1\",\"feeHeadName\":\"Tuition Fee\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "createOneOffCharge": {
      "id": "69fae2a012627d3790c2e8a1",
      "status": "ACTIVE",
      "name": "Sample Name"
    }
  }
}
```

### Revise Invoice

- Folder: `Finance / Invoices`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation ReviseInvoice`
- Variables: `id, input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1",
  "input": {
    "newAmount": 48000,
    "reason": "Scholarship discount applied"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation ReviseInvoice($id: ID!, $input: AWSJSON!) { reviseInvoice(id: $id, input: $input) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1",
    "input": "{\"newAmount\":48000,\"reason\":\"Scholarship discount applied\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "reviseInvoice": "sample"
  }
}
```

### Cancel Invoice

- Folder: `Finance / Invoices`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CancelInvoice`
- Variables: `id, reason`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1",
  "reason": "Cancelled for testing"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CancelInvoice($id: ID!, $reason: String) { cancelInvoice(id: $id, reason: $reason) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1",
    "reason": "Cancelled for testing"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "cancelInvoice": true
  }
}
```

### Record Payment (Cash / Cheque / UPI)

- Folder: `Finance / Payments`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation RecordPayment`
- Variables: `input`
- Saves: `payment_id, receipt_id`

**Sample input data (readable)**

```json
{
  "input": {
    "invoiceId": "69fae2a012627d3790c2e8a1",
    "studentId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "amount": 10000,
    "method": "CASH",
    "remarks": "Partial payment — Term 1"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation RecordPayment($input: AWSJSON!) { recordPayment(input: $input) }",
  "variables": {
    "input": "{\"invoiceId\":\"69fae2a012627d3790c2e8a1\",\"studentId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"amount\":10000,\"method\":\"CASH\",\"remarks\":\"Partial payment — Term 1\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "recordPayment": {
      "id": "69fae2a012627d3790c2e8a1",
      "receiptNo": "RCT2026001",
      "amount": 1000,
      "status": "PAID"
    }
  }
}
```

### Record Payment — Manual Allocation

- Folder: `Finance / Payments`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation RecordPayment`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "invoiceId": "69fae2a012627d3790c2e8a1",
    "studentId": "69fae2a012627d3790c2e8a1",
    "campusId": "69fae2a012627d3790c2e8a1",
    "amount": 5000,
    "method": "UPI",
    "referenceNumber": "UPI123456",
    "allocationMode": "MANUAL",
    "remarks": "UPI payment — manual allocation"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation RecordPayment($input: AWSJSON!) { recordPayment(input: $input) }",
  "variables": {
    "input": "{\"invoiceId\":\"69fae2a012627d3790c2e8a1\",\"studentId\":\"69fae2a012627d3790c2e8a1\",\"campusId\":\"69fae2a012627d3790c2e8a1\",\"amount\":5000,\"method\":\"UPI\",\"referenceNumber\":\"UPI123456\",\"allocationMode\":\"MANUAL\",\"remarks\":\"UPI payment — manual allocation\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "recordPayment": {
      "id": "69fae2a012627d3790c2e8a1",
      "receiptNo": "RCT2026001",
      "amount": 1000,
      "status": "PAID"
    }
  }
}
```

### Collect Payment By Student

- Folder: `Finance / Payments`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CollectPaymentByStudent`
- Variables: `input, studentId`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "studentId": "69fae2a012627d3790c2e8a1",
  "input": {
    "amount": 5000,
    "method": "CASH",
    "remarks": "Bulk collect across all outstanding invoices"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CollectPaymentByStudent($studentId: ID!, $input: AWSJSON!) { collectPaymentByStudent(studentId: $studentId, input: $input) }",
  "variables": {
    "studentId": "69fae2a012627d3790c2e8a1",
    "input": "{\"amount\":5000,\"method\":\"CASH\",\"remarks\":\"Bulk collect across all outstanding invoices\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "collectPaymentByStudent": {
      "id": "69fae2a012627d3790c2e8a1",
      "admissionNo": "ADM2026001",
      "registrationNo": "REG2026001",
      "rollNo": "1",
      "fullName": "Sample Student",
      "status": "ACTIVE"
    }
  }
}
```

### List Payments

- Folder: `Finance / Payments`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listPayments(studentId: \"69fae2a012627d3790c2e8a1\") }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listPayments": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "receiptNo": "RCT2026001",
        "amount": 1000,
        "status": "PAID"
      }
    ]
  }
}
```

### Get Payment

- Folder: `Finance / Payments`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetPayment`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetPayment($id: ID!) { getPayment(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getPayment": {
      "id": "69fae2a012627d3790c2e8a1",
      "receiptNo": "RCT2026001",
      "amount": 1000,
      "status": "PAID"
    }
  }
}
```

### List Receipts

- Folder: `Finance / Payments`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `receipt_id`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listReceipts(studentId: \"69fae2a012627d3790c2e8a1\") }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listReceipts": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "receiptNo": "RCT2026001",
        "amount": 1000,
        "status": "PAID"
      }
    ]
  }
}
```

### Get Receipt

- Folder: `Finance / Payments`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetReceipt`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetReceipt($id: ID!) { getReceipt(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getReceipt": {
      "id": "69fae2a012627d3790c2e8a1",
      "receiptNo": "RCT2026001",
      "amount": 1000,
      "status": "PAID"
    }
  }
}
```

### Create Razorpay Order

- Folder: `Finance / Payments`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CreatePaymentOrder`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "invoiceId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CreatePaymentOrder($input: AWSJSON!) { createPaymentOrder(input: $input) }",
  "variables": {
    "input": "{\"invoiceId\":\"69fae2a012627d3790c2e8a1\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "createPaymentOrder": {
      "id": "69fae2a012627d3790c2e8a1",
      "receiptNo": "RCT2026001",
      "amount": 1000,
      "status": "PAID"
    }
  }
}
```

### Verify Razorpay Signature

- Folder: `Finance / Payments`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation VerifyPaymentSignature`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "razorpayOrderId": "order_test_id",
    "razorpayPaymentId": "pay_test_id",
    "razorpaySignature": "test_signature"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation VerifyPaymentSignature($input: AWSJSON!) { verifyPaymentSignature(input: $input) }",
  "variables": {
    "input": "{\"razorpayOrderId\":\"order_test_id\",\"razorpayPaymentId\":\"pay_test_id\",\"razorpaySignature\":\"test_signature\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "verifyPaymentSignature": "sample"
  }
}
```

### List Allocations by Payment

- Folder: `Finance / Payments`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listPaymentAllocations(paymentId: \"69fae2a012627d3790c2e8a1\") }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listPaymentAllocations": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "receiptNo": "RCT2026001",
        "amount": 1000,
        "status": "PAID"
      }
    ]
  }
}
```

### Day Book

- Folder: `Finance / Reports`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { dayBook(from: \"2025-06-01\", to: \"2025-12-31\", campusId: \"69fae2a012627d3790c2e8a1\") }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "dayBook": "sample"
  }
}
```

### Fee Collection Analytics

- Folder: `Finance / Reports`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { feeCollectionAnalytics(academicYearId: \"69fae2a012627d3790c2e8a1\", campusId: \"69fae2a012627d3790c2e8a1\") }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "feeCollectionAnalytics": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Tuition Fee",
      "amount": 1000,
      "status": "ACTIVE"
    }
  }
}
```


## Health

### Health Check

- Folder: `Health`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { health }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "health": "sample"
  }
}
```


## Identity

### Me (current user)

- Folder: `Identity`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `tenant_id`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { me }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "me": "sample"
  }
}
```

### List Users

- Folder: `Identity`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listUsers }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listUsers": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "email": "user@example.com",
        "fullName": "Sample User",
        "status": "ACTIVE"
      }
    ]
  }
}
```

### Invite Staff / Onboard Staff

- Folder: `Identity`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation InviteStaff`
- Variables: `input`
- Saves: `staff_profile_id`

**Sample input data (readable)**

```json
{
  "input": {
    "email": "teacher@example.com",
    "fullName": "Test Teacher",
    "roleIds": [],
    "campusIds": [
      "69fae2a012627d3790c2e8a1"
    ],
    "allCampuses": false
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation InviteStaff($input: InviteStaffInput!) { inviteStaff(input: $input) { success membershipId } }",
  "variables": {
    "input": {
      "email": "teacher@example.com",
      "fullName": "Test Teacher",
      "roleIds": [],
      "campusIds": [
        "69fae2a012627d3790c2e8a1"
      ],
      "allCampuses": false
    }
  }
}
```

**Sample success response**

```json
{
  "data": {
    "inviteStaff": {
      "success": true,
      "membershipId": "69fae2a012627d3790c2e8a1"
    }
  }
}
```

### List Staff

- Folder: `Identity`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query ListStaff`
- Variables: `campusId`
- Saves: `staff_profile_id`

**Sample input data (readable)**

```json
{
  "campusId": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query ListStaff($campusId: ID) { listStaff(campusId: $campusId) }",
  "variables": {
    "campusId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "listStaff": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "email": "user@example.com",
        "fullName": "Sample User",
        "status": "ACTIVE"
      }
    ]
  }
}
```

### List Employees

- Folder: `Identity`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query ListEmployees`
- Variables: `campusId`
- Saves: `employee_id`

**Sample input data (readable)**

```json
{
  "campusId": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query ListEmployees($campusId: ID) { listEmployees(campusId: $campusId) }",
  "variables": {
    "campusId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "listEmployees": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "email": "user@example.com",
        "fullName": "Sample User",
        "status": "ACTIVE"
      }
    ]
  }
}
```

### Get Employee

- Folder: `Identity`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetEmployee`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetEmployee($id: ID!) { getEmployee(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getEmployee": {
      "id": "69fae2a012627d3790c2e8a1",
      "email": "user@example.com",
      "fullName": "Sample User",
      "status": "ACTIVE"
    }
  }
}
```

### Resend Staff Invite

- Folder: `Identity`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation ResendInvite`
- Variables: `staffId`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "staffId": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation ResendInvite($staffId: ID!) { resendInvite(staffId: $staffId) }",
  "variables": {
    "staffId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "resendInvite": true
  }
}
```

### Accept Invite

- Folder: `Identity`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation AcceptInvite`
- Variables: `token`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "token": "<redacted>"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation AcceptInvite($token: String!) { acceptInvite(token: $token) { success email isExistingUser } }",
  "variables": {
    "token": "<redacted>"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "acceptInvite": {
      "success": true,
      "email": "user@example.com",
      "isExistingUser": true
    }
  }
}
```


## Platform Admin

### Get Platform Token

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://cognito-idp.ap-south-1.amazonaws.com/`
- Kind: `JSON`
- Operation: `AmazonCognitoIdentityProviderService.InitiateAuth`
- Variables: `AuthFlow, AuthParameters, ClientId`
- Saves: `platform_access_token, platform_id_token, platform_refresh_token`

**Sample input data (readable)**

```json
{
  "AuthFlow": "USER_PASSWORD_AUTH",
  "ClientId": "<cognito-client-id>",
  "AuthParameters": {
    "USERNAME": "platform-admin@example.com",
    "PASSWORD": "<redacted>"
  }
}
```

**Actual Postman request body**

```json
{
  "AuthFlow": "USER_PASSWORD_AUTH",
  "ClientId": "<cognito-client-id>",
  "AuthParameters": {
    "USERNAME": "platform-admin@example.com",
    "PASSWORD": "<redacted>"
  }
}
```

**Sample success response**

```json
{
  "AuthenticationResult": {
    "AccessToken": "<redacted>",
    "IdToken": "<redacted>",
    "RefreshToken": "<redacted>",
    "ExpiresIn": 3600,
    "TokenType": "<redacted>"
  }
}
```

### List Tenants

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `target_tenant_id`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listTenants }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listTenants": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "status": "ACTIVE",
        "name": "Sample Name"
      }
    ]
  }
}
```

### Get Tenant

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetTenant`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetTenant($id: ID!) { getTenant(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getTenant": {
      "id": "69fae2a012627d3790c2e8a1",
      "status": "ACTIVE",
      "name": "Sample Name"
    }
  }
}
```

### Create Tenant

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CreateTenant`
- Variables: `input`
- Saves: `target_tenant_id`

**Sample input data (readable)**

```json
{
  "input": {
    "name": "Test School",
    "slug": "test-school-demo",
    "plan": "BASIC",
    "adminEmail": "testadmin@example.com"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CreateTenant($input: AWSJSON!) { createTenant(input: $input) }",
  "variables": {
    "input": "{\"name\":\"Test School\",\"slug\":\"test-school-demo\",\"plan\":\"BASIC\",\"adminEmail\":\"testadmin@example.com\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "createTenant": {
      "id": "69fae2a012627d3790c2e8a1",
      "status": "ACTIVE",
      "name": "Sample Name"
    }
  }
}
```

### Update Tenant

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation UpdateTenant`
- Variables: `id, input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1",
  "input": {
    "plan": "STANDARD"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation UpdateTenant($id: ID!, $input: AWSJSON!) { updateTenant(id: $id, input: $input) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1",
    "input": "{\"plan\":\"STANDARD\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "updateTenant": {
      "id": "69fae2a012627d3790c2e8a1",
      "status": "ACTIVE",
      "name": "Sample Name"
    }
  }
}
```

### Suspend Tenant

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation SuspendTenant`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation SuspendTenant($id: ID!) { suspendTenant(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "suspendTenant": "sample"
  }
}
```

### Reactivate Tenant

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation ReactivateTenant`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation ReactivateTenant($id: ID!) { reactivateTenant(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "reactivateTenant": "sample"
  }
}
```

### Provision Tenant + Campus + Admin

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation ProvisionTenant`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "name": "Demo School",
    "slug": "demo-school",
    "plan": "STANDARD",
    "campusName": "Main Campus",
    "adminEmail": "demoadmin@example.com",
    "adminPassword": "<redacted>"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation ProvisionTenant($input: AWSJSON!) { provisionTenant(input: $input) }",
  "variables": {
    "input": "{\"name\":\"Demo School\",\"slug\":\"demo-school\",\"plan\":\"STANDARD\",\"campusName\":\"Main Campus\",\"adminEmail\":\"demoadmin@example.com\",\"adminPassword\":\"<redacted>\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "provisionTenant": {
      "id": "69fae2a012627d3790c2e8a1",
      "status": "ACTIVE",
      "name": "Sample Name"
    }
  }
}
```

### List All Users (Platform)

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `target_user_id`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listAllUsers(limit: 20) }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listAllUsers": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "email": "user@example.com",
        "fullName": "Sample User",
        "status": "ACTIVE"
      }
    ]
  }
}
```

### Get User (Platform)

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetUser`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetUser($id: ID!) { getUser(id: $id) }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getUser": {
      "id": "69fae2a012627d3790c2e8a1",
      "email": "user@example.com",
      "fullName": "Sample User",
      "status": "ACTIVE"
    }
  }
}
```

### Disable User (Platform)

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation DisableUser`
- Variables: `userId`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "userId": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation DisableUser($userId: ID!) { disableUser(userId: $userId) }",
  "variables": {
    "userId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "disableUser": "sample"
  }
}
```

### Enable User (Platform)

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation EnableUser`
- Variables: `userId`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "userId": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation EnableUser($userId: ID!) { enableUser(userId: $userId) }",
  "variables": {
    "userId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "enableUser": "sample"
  }
}
```

### Delete User (Platform)

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation DeleteUser`
- Variables: `userId`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "userId": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation DeleteUser($userId: ID!) { deleteUser(userId: $userId) }",
  "variables": {
    "userId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "deleteUser": true
  }
}
```

### List Feature Flags

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listFeatureFlags }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listFeatureFlags": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "status": "ACTIVE",
        "name": "Sample Name"
      }
    ]
  }
}
```

### Set Feature Flag

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation SetFeatureFlag`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "flag": "ENABLE_PROMOTIONS",
    "value": true,
    "tenantId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation SetFeatureFlag($input: AWSJSON!) { setFeatureFlag(input: $input) }",
  "variables": {
    "input": "{\"flag\":\"ENABLE_PROMOTIONS\",\"value\":true,\"tenantId\":\"69fae2a012627d3790c2e8a1\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "setFeatureFlag": true
  }
}
```

### Platform Overview (Super Admin Dashboard)

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { platformOverview }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "platformOverview": {
      "total": 1,
      "items": [
        {
          "id": "69fae2a012627d3790c2e8a1",
          "status": "ACTIVE"
        }
      ]
    }
  }
}
```

### Platform Audit Logs

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `platform_audit_log_id`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { platformAuditLogs(limit: 20) }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "platformAuditLogs": "sample"
  }
}
```

### Get Tenant Usage Stats

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetTenantUsage`
- Variables: `tenantId`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "tenantId": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetTenantUsage($tenantId: ID!) { getTenantUsageStats(tenantId: $tenantId) }",
  "variables": {
    "tenantId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getTenantUsageStats": {
      "total": 1,
      "items": [
        {
          "id": "69fae2a012627d3790c2e8a1",
          "status": "ACTIVE"
        }
      ]
    }
  }
}
```

### Request Tenant Deletion (sends OTP)

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation RequestTenantDeletion`
- Variables: `tenantId`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "tenantId": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation RequestTenantDeletion($tenantId: ID!) { requestTenantDeletion(tenantId: $tenantId) }",
  "variables": {
    "tenantId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "requestTenantDeletion": "sample"
  }
}
```

### Confirm Tenant Deletion (with OTP)

- Folder: `Platform Admin`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation ConfirmTenantDeletion`
- Variables: `otp, tenantId`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "tenantId": "69fae2a012627d3790c2e8a1",
  "otp": "<deletion_otp>"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation ConfirmTenantDeletion($tenantId: ID!, $otp: String!) { confirmTenantDeletion(tenantId: $tenantId, otp: $otp) }",
  "variables": {
    "tenantId": "69fae2a012627d3790c2e8a1",
    "otp": "<deletion_otp>"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "confirmTenantDeletion": true
  }
}
```


## Results

### Create Result Batch

- Folder: `Results`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CreateResultBatch`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "examId": "69fae2a012627d3790c2e8a1",
    "classId": "69fae2a012627d3790c2e8a1",
    "sectionId": "69fae2a012627d3790c2e8a1",
    "academicYearId": "69fae2a012627d3790c2e8a1"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CreateResultBatch($input: AWSJSON!) { createResultBatch(input: $input) }",
  "variables": {
    "input": "{\"examId\":\"69fae2a012627d3790c2e8a1\",\"classId\":\"69fae2a012627d3790c2e8a1\",\"sectionId\":\"69fae2a012627d3790c2e8a1\",\"academicYearId\":\"69fae2a012627d3790c2e8a1\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "createResultBatch": {
      "id": "69fae2a012627d3790c2e8a1",
      "status": "ACTIVE",
      "name": "Sample Name"
    }
  }
}
```

### List Result Batches

- Folder: `Results`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listResultBatches(academicYearId: \"69fae2a012627d3790c2e8a1\") }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listResultBatches": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "status": "ACTIVE",
        "name": "Sample Name"
      }
    ]
  }
}
```

### Get Public Result (no auth)

- Folder: `Results`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query GetPublicResult`
- Variables: `token`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "token": "<redacted>"
}
```

**Actual Postman request body**

```json
{
  "query": "query GetPublicResult($token: String!) { getPublicResult(token: $token) }",
  "variables": {
    "token": "<redacted>"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getPublicResult": {
      "id": "69fae2a012627d3790c2e8a1",
      "status": "ACTIVE",
      "name": "Sample Name"
    }
  }
}
```


## Settings

### Create Academic Year

- Folder: `Settings`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CreateAcademicYear`
- Variables: `input`
- Saves: `academic_year_id`

**Sample input data (readable)**

```json
{
  "input": {
    "name": "2025-26",
    "startDate": "2025-06-01",
    "endDate": "2026-05-31"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CreateAcademicYear($input: CreateAcademicYearInput!) { createAcademicYear(input: $input) { id name startDate endDate isActive } }",
  "variables": {
    "input": {
      "name": "2025-26",
      "startDate": "2025-06-01",
      "endDate": "2026-05-31"
    }
  }
}
```

**Sample success response**

```json
{
  "data": {
    "createAcademicYear": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Sample Name",
      "startDate": "2026-05-06",
      "endDate": "2026-05-06",
      "isActive": true
    }
  }
}
```

### Set Active Academic Year

- Folder: `Settings`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation SetActiveAcademicYear`
- Variables: `id`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "id": "69fae2a012627d3790c2e8a1"
}
```

**Actual Postman request body**

```json
{
  "query": "mutation SetActiveAcademicYear($id: ID!) { setActiveAcademicYear(id: $id) { id name isActive } }",
  "variables": {
    "id": "69fae2a012627d3790c2e8a1"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "setActiveAcademicYear": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Sample Name",
      "isActive": true
    }
  }
}
```

### List Academic Years

- Folder: `Settings`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `academic_year_id`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listAcademicYears { id name startDate endDate isActive } }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listAcademicYears": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "name": "Sample Name",
        "startDate": "2026-05-06",
        "endDate": "2026-05-06",
        "isActive": true
      }
    ]
  }
}
```

### Create Campus

- Folder: `Settings`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CreateCampus`
- Variables: `input`
- Saves: `campus_id`

**Sample input data (readable)**

```json
{
  "input": {
    "name": "Main Campus",
    "code": "MAIN",
    "type": "SCHOOL"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CreateCampus($input: AWSJSON!) { createCampus(input: $input) }",
  "variables": {
    "input": "{\"name\":\"Main Campus\",\"code\":\"MAIN\",\"type\":\"SCHOOL\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "createCampus": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "Main Campus",
      "code": "MAIN"
    }
  }
}
```

### List Campuses

- Folder: `Settings`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `campus_id`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listCampuses { id name code type isActive } }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listCampuses": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "name": "Sample Name",
        "code": "SAMPLE001",
        "type": "sample",
        "isActive": true
      }
    ]
  }
}
```

### Create Program

- Folder: `Settings`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation CreateProgram`
- Variables: `input`
- Saves: `program_id`

**Sample input data (readable)**

```json
{
  "input": {
    "name": "School Program",
    "code": "SCH",
    "type": "SCHOOL",
    "durationYears": 12
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation CreateProgram($input: AWSJSON!) { createProgram(input: $input) }",
  "variables": {
    "input": "{\"name\":\"School Program\",\"code\":\"SCH\",\"type\":\"SCHOOL\",\"durationYears\":12}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "createProgram": {
      "id": "69fae2a012627d3790c2e8a1",
      "name": "CBSE",
      "code": "CBSE"
    }
  }
}
```

### List Programs

- Folder: `Settings`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `program_id`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listPrograms { id name code type } }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listPrograms": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "name": "Sample Name",
        "code": "SAMPLE001",
        "type": "sample"
      }
    ]
  }
}
```

### Dashboard Overview

- Folder: `Settings`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query DashboardOverview`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query DashboardOverview { dashboardOverview }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "dashboardOverview": {
      "total": 1,
      "items": [
        {
          "id": "69fae2a012627d3790c2e8a1",
          "status": "ACTIVE"
        }
      ]
    }
  }
}
```

### Get Tenant Features

- Folder: `Settings`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { getTenantFeatures }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "getTenantFeatures": {
      "id": "69fae2a012627d3790c2e8a1",
      "status": "ACTIVE",
      "name": "Sample Name"
    }
  }
}
```

### Update Tenant Features

- Folder: `Settings`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation UpdateTenantFeatures`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "admissions": true,
    "finance": true,
    "academics": true,
    "communications": true
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation UpdateTenantFeatures($input: AWSJSON!) { updateTenantFeatures(input: $input) }",
  "variables": {
    "input": "{\"admissions\":true,\"finance\":true,\"academics\":true,\"communications\":true}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "updateTenantFeatures": {
      "id": "69fae2a012627d3790c2e8a1",
      "status": "ACTIVE",
      "name": "Sample Name"
    }
  }
}
```

### List Audit Logs

- Folder: `Settings`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listAuditLogs(limit: 20) }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listAuditLogs": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "status": "ACTIVE",
        "name": "Sample Name"
      }
    ]
  }
}
```

### List Templates

- Folder: `Settings`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `query`
- Variables: `None`
- Saves: `None`

**Sample input data (readable)**

```json
{}
```

**Actual Postman request body**

```json
{
  "query": "query { listTemplates }",
  "variables": {}
}
```

**Sample success response**

```json
{
  "data": {
    "listTemplates": [
      {
        "id": "69fae2a012627d3790c2e8a1",
        "status": "ACTIVE",
        "name": "Sample Name"
      }
    ]
  }
}
```


## Storage

### Get Upload URL

- Folder: `Storage`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation GenerateUploadUrl`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "fileName": "test-document.pdf",
    "contentType": "application/pdf",
    "folder": "documents"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation GenerateUploadUrl($input: AWSJSON!) { getUploadUrl(input: $input) }",
  "variables": {
    "input": "{\"fileName\":\"test-document.pdf\",\"contentType\":\"application/pdf\",\"folder\":\"documents\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getUploadUrl": {
      "uploadUrl": "https://example.com/upload",
      "fileKey": "tenant/sample.pdf"
    }
  }
}
```

### Get Download URL

- Folder: `Storage`
- Method: `POST`
- URL: `https://example.appsync-api.ap-south-1.amazonaws.com/graphql`
- Kind: `GraphQL`
- Operation: `mutation GenerateDownloadUrl`
- Variables: `input`
- Saves: `None`

**Sample input data (readable)**

```json
{
  "input": {
    "key": "documents/test-document.pdf"
  }
}
```

**Actual Postman request body**

```json
{
  "query": "mutation GenerateDownloadUrl($input: AWSJSON!) { getDownloadUrl(input: $input) }",
  "variables": {
    "input": "{\"key\":\"documents/test-document.pdf\"}"
  }
}
```

**Sample success response**

```json
{
  "data": {
    "getDownloadUrl": {
      "id": "69fae2a012627d3790c2e8a1",
      "status": "ACTIVE",
      "name": "Sample Name"
    }
  }
}
```
