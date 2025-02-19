const express = require("express");
const { verifyToken } = require("../middleware");
const {
  addEnrolledCourses,
  getUser,
  getCourses,
  getUserCourses,
  getModules,
  getContent,
  getEnrolledCourses,
  deleteEnrolledCourse,
  courseProgress,
  courseComplete,
  moduleProgress,
  courseCompletion,
  userProgress,
  deleteUserProgress,
  progressBar,
} = require("../mysql/queries");
const mySQL = require("../mysql/driver");
const router = express.Router();

router.get("/getEnrolledCourses", async (request, response) => {
  const { token } = request.headers;
  const user = await mySQL(getUser(), [token]);

  // if user not logged in, only access basic course info
  if (user < 1) {
    const courses = await mySQL(getCourses());
    response.send({ code: 1, courses: courses });
    return;
  }
  // if user logged in, access entirety of course
  if (user) {
    const courses = await mySQL(getUserCourses(), [user[0].user_id]);
    const modules = await mySQL(getModules());
    const content = await mySQL(getContent());

    const joinedCourses = {};

    courses.forEach((course) => {
      joinedCourses[course.course_id] = course;
      course.modules = [];
    });
    const joinedModules = {};

    modules.forEach((module) => {
      if (joinedCourses[module.course_id]) {
        joinedCourses[module.course_id].modules.push(module);
        joinedModules[module.id] = module;
        module.content = [];
      }
    });

    content.forEach((content) => {
      if (joinedModules[content.module_id]) {
        joinedModules[content.module_id].content.push(content);
      }
    });
    response.send({ code: 1, courses: courses });
  }
});

router.patch("/enrolled", async (request, response) => {
  const { token } = request.headers;
  const user = await mySQL(getUser(), [token]);
  if (user < 1) {
    response.send({ code: 0, message: "No matching account" });
    return;
  }
  console.log(user);
  const enrolledCourses = await mySQL(getEnrolledCourses(), [token]);
  const { course_title, course_id, image } = request.body;

  if (enrolledCourses) {
    const duplicate = enrolledCourses.some((item) => {
      return item.course_title.includes(course_title);
    });
    if (duplicate) {
      response.send({ code: 0, message: "Already enrolled" });
      return;
    }
  }

  await mySQL(addEnrolledCourses(), [
    user[0].user_id,
    course_title,
    course_id,
    image,
  ]);
  response.send({ code: 1, message: "Enrolled on course" });
});

router.get("/userProgress", async (request, response) => {
  const { token, id } = request.headers;
  const user = await mySQL(getUser(), [token]);
  if (user < 1) {
    response.send({ code: 0, message: "No matching account" });
    return;
  }
  const result = await mySQL(userProgress(), [token, Number(id)]);

  if (
    result < 1 ||
    result[0].course_id === null ||
    result[0].module_ids === null
  ) {
    response.send({ code: 0, message: "No user progress" });
    return;
  }
  let newArray = result[0].module_ids
    .split(",")
    .map((str) => Number(str.trim()));
  result[0].module_ids = newArray;
  response.send({ code: 1, message: result[0] });
});

router.get("/progressBar", async (request, response) => {
  const { token } = request.headers;
  const user = await mySQL(getUser(), [token]);
  if (user < 1) {
    response.send({ code: 0, message: "No matching account" });
    return;
  }

  const resultAsStrings = await mySQL(progressBar(), [token]);
  if (resultAsStrings < 1) {
    response.send({ code: 0, message: "No progress to return" });
    return;
  }
  const resultAsArrays = resultAsStrings.map((item) => {
    return { ...item, module_ids: item.module_ids.split(", ").map(Number) };
  });

  response.send({ code: 1, message: resultAsArrays });
});

router.patch("/moduleProgress", async (request, response) => {
  const { token } = request.headers;
  const { moduleId, courseId } = request.body;

  const user = await mySQL(getUser(), [token]);
  if (user < 1) {
    response.send({ code: 0, message: "No matching account" });
    return;
  }

  try {
    await mySQL(moduleProgress(), [
      user[0].user_id,
      courseId,
      moduleId,
      "complete",
    ]);
    response.send({ code: 1, message: "Module progress recorded" });
  } catch (error) {
    if ((error.code = "ER_DUP_ENTRY")) {
      response.send({ code: 0, message: "Module already completed" });
      return;
    }
    response.send({
      code: 0,
      message: "Error, unble to complete module. Please try again later",
    });
  }
});

router.patch("/courseCompletion", async (request, response) => {
  const { token } = request.headers;
  const { courseId } = request.body;

  const user = await mySQL(getUser(), [token]);
  if (user < 1) {
    response.send({ code: 0, message: "No matching account" });
    return;
  }

  try {
    await mySQL(courseCompletion(), [1, user[0].user_id, Number(courseId)]);
    response.send({ code: 1, message: "Course finished" });
  } catch (error) {
    console.log(error);
    if ((error.code = "ER_DUP_ENTRY")) {
      response.send({ code: 0, message: "Course already completed" });
      return;
    }
    response.send({
      code: 0,
      message: "Error completing course",
      error: error,
    });
  }
});

router.delete("/deleteEnrolled", async (request, response) => {
  const { token } = request.headers;
  const courseId = request.headers.id;

  try {
    await mySQL(deleteEnrolledCourse(), [token, Number(courseId)]);
    await mySQL(deleteUserProgress(), [token, Number(courseId)]);
    response.send({ code: 1, message: "Successfully left course" });
  } catch (error) {
    if (error) {
      response.send({ code: 0, message: "Error deleting course" });
    }
  }
});

module.exports = router;
