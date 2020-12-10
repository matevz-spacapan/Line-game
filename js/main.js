var debugging=true;
var canvas, ctx, camera, line;
var imageData, detector1, detector2;
var ctxDcam, ctxD1, ctxD2, ctxD3;
var canvasDcam, canvasD1, canvasD2, canvasD3;
//var lines=[{start:{x:700, y:0}, end:{x:1000, y:500}}, {start:{x:200, y:200}, end:{x:1000, y:250}}]
var lines=[]
var circle={center:{x:670, y:50}, radius:20};
var velocity={x:2, y:0};
var debug={width:320, height:240};
var finish={x:700, y:600, size:100};

//initialise function is called when HTML document fully loads
function init(){

  //get camera canvas and load the camera it
  camera = document.getElementById("video");
  camera.width = 320;
  camera.height = 240;
  ctxDcam = document.getElementById("debug_cam").getContext("2d");
  loadCamera();

  //debugging canvases
  ctxD1 = document.getElementById("debug1").getContext("2d");
  canvasD2 = document.getElementById("debug2");
  ctxD2 = canvasD2.getContext("2d");
  ctxD3 = document.getElementById("debug3").getContext("2d");

  //game canvas
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");

  //init the AR detectors
  detector1 = new AR.Detector();
  detector2 = new AR.Detector();

  //start the redrawing process
  setTimeout(tick, 0);
}

//load the camera
function loadCamera(){
  if (navigator.mediaDevices === undefined) {
    navigator.mediaDevices = {};
  }
  if (navigator.mediaDevices.getUserMedia === undefined) {
    navigator.mediaDevices.getUserMedia = function(constraints) {
      var getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

      if (!getUserMedia) {
        return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
      }

      return new Promise(function(resolve, reject) {
        getUserMedia.call(navigator, constraints, resolve, reject);
      });
    }
  }
  navigator.mediaDevices
    .getUserMedia({ video: true })
    .then(function(stream) {
      if ("srcObject" in video) {
        video.srcObject = stream;
      } else {
        video.src = window.URL.createObjectURL(stream);
      }
    })
    .catch(function(err) {
      console.log(err.name + ": " + err.message);
    }
  );
}

//take a "picture" of the video from the camera
function snapshot(){
  ctxDcam.drawImage(video, 0, 0, camera.width, camera.height);
  imageData = ctxDcam.getImageData(0, 0, camera.width, camera.height);
}

//function used to crop the image from camera to the area where the player
//may draw lines (inside of aruco markers)
function rotateImg(markers){
  //must detect all 4 markers before attempting a crop
  if(markers.length<4){
    console.log("Not enough markers "+markers.length);
    return false;
  }

  var src = cv.imread('debug_cam'), dst = new cv.Mat(), dstRotated = new cv.Mat();
  var arr = [-1, -1, -1, -1, -1, -1];
  for (var i = 0; i < markers.length; i++){
    var corners = markers[i].corners; //corners of the aruco marker
    switch(markers[i].id){
      //top left
      case 77:
        arr[0]=corners[2].x;
        arr[1]=corners[2].y;
        break;
      //top right
      case 0:
        arr[2]=corners[3].x;
        arr[3]=corners[3].y;
        break;
      //bottom left
      case 213:
        arr[4]=corners[1].x;
        arr[5]=corners[1].y;
        break;
    }
  }

  //if we still have -1 in the array, we didn't get the correct markers
  if(arr.includes(-1)){
    console.log("Didn't find wanted markers "+arr);
    return false;
  }
  console.log(arr);
  /* use an affine transform of the image:
   * from values in array into:
   * 0,0 (top left corner of canvas)
   * width, 0 (top right corner)
   * 0, height (bottom left corner)
   * with this we crop the image to only get the inside square of the markers
  */
  let srcTri = cv.matFromArray(3, 1, cv.CV_32FC2, arr);
  let dstTri = cv.matFromArray(3, 1, cv.CV_32FC2, [0, 0, debug.width, 0, 0, debug.height]);
  let dsize = new cv.Size(src.cols, src.rows);
  let M = cv.getAffineTransform(srcTri, dstTri);
  cv.warpAffine(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
  cv.rotate(dst, dstRotated, cv.ROTATE_90_COUNTERCLOCKWISE);
  cv.imshow('debug2', dst); //draw this into second debug canvas
  return true;
}

//if debugging is enabled, then this function will fill the debugging canvases
function debuggingDraw(markers){
  ctxD1.putImageData(imageData, 0, 0);
  drawPolys(detector1, ctxD1);
  drawMarkerLines(markers, ctxD1);
  drawId(markers);
}

//function to draw found poly's of length 2 (lines)
function drawPolys(detector, context){
  var counter=0;
  context.strokeStyle = "green";
  for(var i=0; i<detector.polys.length; i++){
    var contour = detector.polys[i];

    //only draw lines (poly's with length 2)
    if(contour.length!=2)
      continue;

    context.beginPath();
    for(var j = 0; j < contour.length; ++ j){
      var point = contour[j];
      context.moveTo(point.x, point.y);
      context.fillText(counter++, point.x, point.y)
      point = contour[(j + 1) % contour.length];
      context.lineTo(point.x, point.y);
      context.fillText(counter++, point.x, point.y)
    }
    context.stroke();
    context.closePath();
  }
}

//function to scale poly's from 320 x 240 into 1280 x 960 (*4)
//and save them into lines variable
function scaleSavePolys(detector){

  //clear lines
  lines=[]

  //detect new lines
  for(var i=0; i<detector.polys.length; i++){
    var contour = detector.polys[i];

    //only draw lines (poly's with length 2)
    if(contour.length!=2)
      continue;

    for(var j = 0; j < contour.length; ++ j){
      var point1 = contour[j];
      //context.moveTo(point.x, point.y);
      var point2 = contour[(j + 1) % contour.length];
      //context.lineTo(point2.x, point2.y);
      if(point1.x>3 && point1.x<canvas.width-3 && point1.y>3 && point1.y<canvas.height-3){
        if(point2.x>3 && point2.x<canvas.width-3 && point2.y>3 && point2.y<canvas.height-3){
          lines.push({start:{x:point1.x*4, y:point1.y*4}, end:{x:point2.x*4, y:point2.y*4}});
        }
      }
    }
  }
}

//draw squares to represent markers
function drawMarkerLines(markers, context){
  var corners, corner, i, j;
  context.lineWidth = 3;
  for (i = 0; i !== markers.length; ++ i){
    corners = markers[i].corners;
    context.strokeStyle = "red";
    context.beginPath();
    for (j = 0; j !== corners.length; ++ j){
      corner = corners[j];
      context.moveTo(corner.x, corner.y);
      corner = corners[(j + 1) % corners.length];
      context.lineTo(corner.x, corner.y);
    }
    context.stroke();
    context.closePath();
    context.strokeStyle = "green";
    context.strokeRect(corners[0].x - 2, corners[0].y - 2, 4, 4);
  }
}

function drawId(markers){
  var corners, corner, x, y, i, j;

  ctxD1.strokeStyle = "blue";
  ctxD1.lineWidth = 1;

  for (i = 0; i !== markers.length; ++ i){
    corners = markers[i].corners;

    x = Infinity;
    y = Infinity;

    for (j = 0; j !== corners.length; ++ j){
      corner = corners[j];

      x = Math.min(x, corner.x);
      y = Math.min(y, corner.y);
    }
    switch(markers[i].id){
      case 77:
        ctxD1.strokeText(markers[i].id, corners[2].x, corners[2].y);
        break;
      case 0:
        ctxD1.strokeText(markers[i].id, corners[3].x, corners[3].y);
        break;
      case 213:
        ctxD1.strokeText(markers[i].id, corners[1].x, corners[1].y);
        break;
      default:
        ctxD1.strokeText(markers[i].id, x, y);
    }
  }
}

//distance between two points
function distance(point1, point2){
  return Math.sqrt(Math.pow(point2.x-point1.x, 2)+Math.pow(point2.y-point1.y, 2));
}

//subtract two vectors
function vectorDifference(vec1, vec2){
  return {x:vec2.x-vec1.x, y:vec2.y-vec1.y};
}

//vector length ... ||vec||
function vectorLength(vec){
  return Math.sqrt(Math.pow(vec.x, 2) + Math.pow(vec.y, 2));
}

//make vector unit size
function unitVector(vec){
  return {x:vec.x/vectorLength(vec), y:vec.y/vectorLength(vec)};
}

//multiply two vectors
function vectorDot(vec1, vec2){
  return vec1.x * vec2.x + vec1.y * vec2.y;
}

//calculate the closest point on the given line for the given circle
function pointClosestToCircle(circle, line){
  var diff=vectorDifference(line.start, line.end);
  var uv=unitVector(diff);
  var lineToCircle=vectorDifference(line.start, circle.center);
  var proj=vectorDot(lineToCircle, uv);
  if(proj<=0)
    return line.start; //closest to start of line
  else if(proj>=distance(line.start, line.end))
    return line.end; //closest to end of line
  else
    return {x:line.start.x+uv.x*proj, y:line.start.y+uv.y*proj}; //the point on the line that's closest to the circle
}

//draw the given line
function drawLine(line){
  ctx.beginPath();
  ctx.moveTo(line.start.x, line.start.y);
  ctx.lineTo(line.end.x, line.end.y);
  ctx.stroke();
  ctx.closePath();
}

//draws the position of the finish area
function drawFinish(){
  ctx.strokeStyle = "#57ba22";
  ctx.beginPath();
  ctx.rect(finish.x-finish.size/2, finish.y-finish.size/2, finish.size, finish.size);
  ctx.stroke();
  ctx.closePath();
    ctx.strokeStyle = "#000000";
}

//check if circle is touching a line and bounce it if it is
function checkTouch(line){

  //calculate if circle is touching the line
  var closest=pointClosestToCircle(circle, line);
  var dist=distance(circle.center, closest);

  //if it is touching the line, bounce it
  if(dist<circle.radius){
    console.log(line);
    var diff=vectorDifference(closest, circle.center);
    var uv=unitVector({x:diff.x, y:diff.y});
    var dot=vectorDot(velocity, uv);
    velocity.x-=2*dot*uv.x;
    velocity.y-=2*dot*uv.y;
    return true;
  }
  return false;
}

//check if the circle is in finish area
function checkFinish(){
  if(circle.center.x-circle.radius>=finish.x-finish.size/2 && circle.center.x+circle.radius<=finish.x+finish.size/2 && circle.center.y-circle.radius>=finish.y-finish.size/2 && circle.center.y+circle.radius<=finish.y+finish.size/2)
    return true;
  return false;
}

//move the circle and draw it
function moveDrawCircle(){

  //check that circle isn't touching the canvas edge
  if(circle.center.x+circle.radius>=canvas.width || circle.center.x-circle.radius<=0)
    velocity.x*=-1;
  if(circle.center.y+circle.radius>=canvas.height || circle.center.y-circle.radius<=0)
    velocity.y*=-1;

  //move circle based on velocity
  circle.center.x+=velocity.x;
  circle.center.y+=velocity.y;

  if(checkFinish())
    ctx.strokeStyle = "#57ba22";
  else
    ctx.strokeStyle = "#ffb300";

  //draw circle
  ctx.beginPath();
  ctx.arc(circle.center.x, circle.center.y, circle.radius, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.closePath();
  ctx.strokeStyle = "#000000";
}

//the "main" function that checks the camera feed and draws on the canvas
function tick(){

  // when we have enough data from camera, take a picture of it for processing
  if (video.readyState === video.HAVE_ENOUGH_DATA){
    snapshot();
    var markers = detector1.detect(imageData);

    if(debugging){
      debuggingDraw(markers);
    }
    drawMarkerLines(markers, ctxDcam);
    var detected=rotateImg(markers);
    if(detected){
      detector2.detect(ctxD2.getImageData(0, 0, debug.height, debug.width));
      drawPolys(detector2, ctxD2);
      ctxD3.clearRect(0, 0, 600, 600);
      drawPolys(detector2, ctxD3);
      scaleSavePolys(detector2);
    }
  }

  //draw lines
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (var i = 0; i < lines.length; i++){
    drawLine(lines[i]);
  }

  //after lines are drawn, check if ball is touching any
  //we do this after so that lines don't seem to blink
  for (var i = 0; i < lines.length; i++){
    if(checkTouch(lines[i]))
      break;
  }

  drawFinish();

  //move the circle accordingly
  moveDrawCircle();

  //redraw at 30FPS
  setTimeout(tick, 1000/30);
}
