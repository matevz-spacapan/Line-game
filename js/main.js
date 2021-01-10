var canvas, ctx, camera, line;
var imageData, detector;

var ctxDcam, ctxD1, ctxD2, ctxD3, ctxD4;
var debug={width:320, height:240};

var lines, circle, velocity, multiplier=1, finish;

var imgBall = new Image(), imgFinish = new Image();
imgBall.src = "ball.png";
imgFinish.src = "finish.png";

var colorRanges={
    red:{
      start:{
        min:[0, 70, 70, 0],
        max:[20, 255, 255, 255]
      },
      end:{
        min:[150, 70, 70, 0],
        max:[180, 255, 255, 255]
      }
    },
    green:{
      min:[50, 50, 50, 0],
      max:[130, 255, 255, 255]
    }
  };

//level variables
var level=0;

var linesLevels=[
  [],
  [
    {start:{x:-1, y:401}, end:{x:750, y:750}, color:"black"},
    {start:{x:-1, y:100}, end:{x:100, y:-1}, color:"black"},
    {start:{x:1181, y:0}, end:{x:1281, y:100}, color:"black"},
    {start:{x:-1, y:860}, end:{x:100, y:961}, color:"black"},
    {start:{x:1181, y:961}, end:{x:1281, y:860}, color:"black"}
  ],
  [
    {start:{x:-1, y:250}, end:{x:950, y:350}, color:"black"},
    {start:{x:330, y:600}, end:{x:1281, y:600}, color:"black"},
    {start:{x:-1, y:800}, end:{x:950, y:800}, color:"black"},
    {start:{x:1000, y:-1}, end:{x:850, y:150}, color:"black"},
    {start:{x:850, y:-1}, end:{x:850, y:150}, color:"black"},
    {start:{x:250, y:-1}, end:{x:-1, y:100}, color:"black"}
  ]
];

var circleLevels=[
  {center:{x:670, y:100}, radius:30},
  {center:{x:300, y:300}, radius:40},
  {center:{x:100, y:890}, radius:50}
];

var velocityLevels=[
  {x:3, y:2},
  {x:0, y:3},
  {x:2, y:0}
];

var finishLevels=[
  {x:700, y:600, size:80, scale:0.36},
  {x:70, y:600, size:80, scale:0.36},
  {x:780, y:70, size:70, scale:0.32}
];


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
  ctxD2 = document.getElementById("debug2").getContext("2d");
  ctxD3 = document.getElementById("debug3").getContext("2d");
  ctxD4 = document.getElementById("debug4").getContext("2d");

  //game canvas
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");
  ctx.lineWidth=2;

  //init the AR detectors
  detector = new AR.Detector();

  //load level 0
  loadLevel();

  //start the redrawing process
  setTimeout(tick, 0);
}

//loads the level
function loadLevel(){
  if(level>2)
    return false;
  speed(1);
  lines=JSON.parse(JSON.stringify(linesLevels[level]));
  circle=JSON.parse(JSON.stringify(circleLevels[level]));
  velocity=JSON.parse(JSON.stringify(velocityLevels[level]));
  finish=JSON.parse(JSON.stringify(finishLevels[level]));
  return true;

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
    if(markers.length>0)
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
  drawPolys(detector, ctxD1);
  drawMarkerLines(markers, ctxD1);
  drawId(markers);
}

//function to draw found poly's of length 2 (lines)
function drawPolys(detector, context){
  var counter=0;
  context.strokeStyle = "blue";
  for(var i=0; i<detector.polys.length; i++){
    var contour = detector.polys[i];

    //only draw lines (poly's with length 2)
    if(contour.length!=2)
      continue;

    context.beginPath();
    //check if color of line is red
    var pol=pointOnLine(contour[0], contour[1]);
    if(ctxD3.getImageData(pol[0].x, pol[0].y, 1, 1).data[0]==255 ||
      ctxD3.getImageData(pol[1].x, pol[1].y, 1, 1).data[0]==255 ||
      ctxD3.getImageData(pol[2].x, pol[2].y, 1, 1).data[0]==255)
        context.strokeStyle = "red";
    else if(ctxD4.getImageData(pol[0].x, pol[0].y, 1, 1).data[0]==255 ||
      ctxD4.getImageData(pol[1].x, pol[1].y, 1, 1).data[0]==255 ||
      ctxD4.getImageData(pol[2].x, pol[2].y, 1, 1).data[0]==255)
        context.strokeStyle = "green";

    //draw line in debug canvas
    context.moveTo(contour[0].x, contour[0].y);
    context.fillText(counter++, contour[0].x, contour[0].y);
    context.lineTo(contour[1].x, contour[1].y);
    context.fillText(counter++, contour[1].x, contour[1].y);
    context.stroke();
    context.closePath();
    context.strokeStyle = "blue";
  }
}

//function to scale poly's from 320 x 240 into 1280 x 960 (*4)
//and save them into lines variable
function scaleSavePolys(detector){

  //clear lines
  lines=JSON.parse(JSON.stringify(linesLevels[level]));

  //detect new lines
  for(var i=0; i<detector.polys.length; i++){
    var contour = detector.polys[i];

    //only draw lines (poly's with length 2)
    if(contour.length!=2)
      continue;

    var point1 = contour[0];
    var point2 = contour[1];

    //check if line is on the canvas instead of the edge
    if(pointOnCanvas(point1) || pointOnCanvas(point2)){

      //determine line color - default is black
      var color="black"
      var pol=pointOnLine(contour[0], contour[1]);
      if(ctxD3.getImageData(pol[0].x, pol[0].y, 1, 1).data[0]==255 ||
        ctxD3.getImageData(pol[1].x, pol[1].y, 1, 1).data[0]==255 ||
        ctxD3.getImageData(pol[2].x, pol[2].y, 1, 1).data[0]==255)
          color="red";
      else if(ctxD4.getImageData(pol[0].x, pol[0].y, 1, 1).data[0]==255 ||
        ctxD4.getImageData(pol[1].x, pol[1].y, 1, 1).data[0]==255 ||
        ctxD4.getImageData(pol[2].x, pol[2].y, 1, 1).data[0]==255)
          color="green";

      //add line to the array
      lines.push({start:{x:point1.x*4, y:point1.y*4}, end:{x:point2.x*4, y:point2.y*4}, color:color});
    }
  }
}

//checks if the point is on the canvas -3 px on every edge
function pointOnCanvas(point){
  return point.x>3 && point.x<canvas.width-3 && point.y>3 && point.y<canvas.height-3;
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
  ctx.strokeStyle = line.color;
  ctx.beginPath();
  ctx.moveTo(line.start.x, line.start.y);
  ctx.lineTo(line.end.x, line.end.y);
  ctx.stroke();
  ctx.closePath();
}

//draws the position of the finish area
function drawFinish(){
  ctx.drawImage(imgFinish, finish.x-finish.size/2, finish.y-finish.size/2, imgFinish.width*finish.scale, imgFinish.height*finish.scale);
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
  var size=finish.size+20 //be friendly to the player and give way to the ball - it doesn't have to fully be in the square
  if(2*circle.radius<=finish.size && circle.center.x-circle.radius>=finish.x-size/2 && circle.center.x+circle.radius<=finish.x+size/2 && circle.center.y-circle.radius>=finish.y-size/2 && circle.center.y+circle.radius<=finish.y+size/2)
    return true;
  return false;
}

//move the circle and draw it
function moveDrawCircle(){

  //check that circle isn't touching the canvas edge
  if(circle.center.x+circle.radius>=canvas.width || circle.center.x-circle.radius<=0){
    velocity.x*=-1;
    if(circle.center.x+circle.radius-10>=canvas.width)
      circle.center.x=canvas.width-circle.radius-5;
    else if(circle.center.x-circle.radius+10<=0)
      circle.center.x=circle.radius+5;
  }
  if(circle.center.y+circle.radius>=canvas.height || circle.center.y-circle.radius<=0){
    velocity.y*=-1;
    if(circle.center.y+circle.radius-10>=canvas.height)
      circle.center.y=canvas.height-circle.radius-5;
    else if(circle.center.y-circle.radius+10<=0)
      circle.center.y=circle.radius+5;
  }

  //move circle based on velocity
  circle.center.x+=velocity.x;
  circle.center.y+=velocity.y;

  if(checkFinish()){
    //ctx.strokeStyle = "#57ba22";
    level++;
    loadLevel();
  }
  else
    ctx.strokeStyle = "#ffb300";

  ctx.drawImage(imgBall, circle.center.x-circle.radius, circle.center.y-circle.radius, imgBall.width*circle.radius/100, imgBall.height*circle.radius/100)
}

//detect areas on the image that are of red color
function redLines(){
  let src = cv.imread('debug2');
  let mask1 = new cv.Mat();
  let mask2 = new cv.Mat();
  let dst = new cv.Mat();

  //convert to HSV color space
  cv.cvtColor(src, src, cv.COLOR_BGR2HSV_FULL, 0);

  //we need to have 2 masks, because red colors are on either side of the HSV color spectrum
  var low = new cv.Mat(src.rows, src.cols, src.type(), colorRanges.red.start.min);
  var high = new cv.Mat(src.rows, src.cols, src.type(), colorRanges.red.start.max);
  cv.inRange(src, low, high, mask1);
  low = new cv.Mat(src.rows, src.cols, src.type(), colorRanges.red.end.min);
  high = new cv.Mat(src.rows, src.cols, src.type(), colorRanges.red.end.max);
  cv.inRange(src, low, high, mask2);

  //add the two masks into one
  cv.add(mask1, mask2, dst);
  cv.imshow('debug3', dst);
}

//detect areas on the image that are of green color
function greenLines(){
  let src = cv.imread('debug2');
  let dst = new cv.Mat();

  //convert to HSV color space
  cv.cvtColor(src, src, cv.COLOR_BGR2HSV_FULL, 0);

  //detect green colors into the mask
  var low = new cv.Mat(src.rows, src.cols, src.type(), colorRanges.green.min);
  var high = new cv.Mat(src.rows, src.cols, src.type(), colorRanges.green.max);
  cv.inRange(src, low, high, dst);

  //add the two masks into one
  cv.imshow('debug4', dst);
}

//returns the point coordinates on the line at position n
function pointOnLine(point1, point2, n=-1){
  var d = distance(point1, point2);

  //if n is not supplied, we get the point at the center of the line
  if(n==-1){
    var n0=d/4;
    var points=[];
    n=n0;
    for (var i = 0; i < 3; i++) {
      var r = n / d;

      //make sure the first point is the one more to the left of the canvas
      if(point1.x<point2.x){
        var tmp=point1;
        point1=point2;
        point2=tmp;
      }
      var x = r * point2.x + (1 - r) * point1.x;
      var y = r * point2.y + (1 - r) * point1.y;
      n+=n0;
      points.push({x:x, y:y});
    }
    return points;
  }

  var r = n / d;

  //make sure the first point is the one more to the left of the canvas
  if(point1.x<point2.x){
    var tmp=point1;
    point1=point2;
    point2=tmp;
  }
  var x = r * point2.x + (1 - r) * point1.x;
  var y = r * point2.y + (1 - r) * point1.y;
  return {x:x, y:y};
}

//the "main" function that checks the camera feed and draws on the canvas
function tick(){
  try {
    // when we have enough data from camera, take a picture of it for processing
    if (video.readyState === video.HAVE_ENOUGH_DATA){
      snapshot();
      var markers = detector.detect(imageData);

      debuggingDraw(markers);
      drawMarkerLines(markers, ctxDcam);
      var detected=rotateImg(markers);
      if(detected){
        ctxD3.clearRect(0, 0, debug.width, debug.height);
        redLines(); //color mask for red lines
        greenLines(); //color mask for green lines
        detector.detect(ctxD2.getImageData(0, 0, debug.width, debug.height));
        drawPolys(detector, ctxD3);
        scaleSavePolys(detector);
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
      if(checkTouch(lines[i])){
        if(lines[i].color=="red" && circle.radius>20){
          circle.radius-=5;
        }
        else if(lines[i].color=="green" && distance({x:0,y:0}, velocity)>1.5){
          if(Math.abs(velocity.x)>=0.2)
            velocity.x*=0.7;
          if(Math.abs(velocity.y)>=0.2)
            velocity.y*=0.7;
        }
        break;
      }
    }

    drawFinish();

    //move the circle accordingly
    moveDrawCircle();

    //redraw at 30FPS
    if(level<=2)
      setTimeout(tick, 1000/30);

  } catch (e) {
    console.log(e);
    setTimeout(tick, 1000/30);
  }
}

function speed(v){
  if(v==1 && multiplier!=1){
    $(".normal").removeClass("btn-outline-green").addClass("btn-green");
    $(".twox").removeClass("btn-green").addClass("btn-outline-green");
    $(".fourx").removeClass("btn-green").addClass("btn-outline-green");
    if(multiplier==2){
      velocity.x/=2;
      velocity.y/=2;
    }
    else if(multiplier==4){
      velocity.x/=4;
      velocity.y/=4;
    }
    multiplier=1;
  }
  else if(v==2 && multiplier!=2){
    $(".normal").removeClass("btn-green").addClass("btn-outline-green");
    $(".twox").removeClass("btn-outline-green").addClass("btn-green");
    $(".fourx").removeClass("btn-green").addClass("btn-outline-green");
    if(multiplier==1){
      velocity.x*=2;
      velocity.y*=2;
    }
    else{
      velocity.x/=2;
      velocity.y/=2;
    }
    multiplier=2;
  }
  else if(v==4 && multiplier!=4){
    $(".normal").removeClass("btn-green").addClass("btn-outline-green");
    $(".twox").removeClass("btn-green").addClass("btn-outline-green");
    $(".fourx").removeClass("btn-outline-green").addClass("btn-green");
    if(multiplier==2){
      velocity.x*=2;
      velocity.y*=2;
    }
    else{
      velocity.x*=4;
      velocity.y*=4;
    }
    multiplier=4;
  }
}

function resetBall(){
  circle=JSON.parse(JSON.stringify(circleLevels[level]));
  velocity=JSON.parse(JSON.stringify(velocityLevels[level]));
}

function resetLines(){
  lines=JSON.parse(JSON.stringify(linesLevels[level]));
}
