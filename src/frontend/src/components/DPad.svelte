<div class="dpad-container relative flex items-center justify-center w-48 h-48">
  <nav class="d-pad relative">
    <a class="up" href="#"><i class="fas fa-chevron-up"></i></a>
    <a class="right" href="#"><i class="fas fa-chevron-right"></i></a>
    <a class="down" href="#"><i class="fas fa-chevron-down"></i></a>
    <a class="left" href="#"><i class="fas fa-chevron-left"></i></a>
    <div class="center-circle"></div>
  </nav>
</div>

<style>
.d-pad {
  position: relative;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: #3f3f40;
  overflow: hidden;
}

.up, .down, .left, .right {
  width: 30%;
  height: 30%;
  transform: translate(-50%) rotate(45deg);
}

.d-pad a {
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #cacac9;
  font-size: 24px;
  transition: all 0.2s ease;
}

.d-pad a i {
  transform: rotate(-45deg);
}

.d-pad a.up {
  top: 0;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
}

.d-pad a.right {
  top: 50%;
  right: 0;
  transform: translateY(-50%) rotate(45deg);
}

.d-pad a.down {
  bottom: 0;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
}

.d-pad a.left {
  top: 50%;
  left: 0;
  transform: translateY(-50%) rotate(45deg);
}

.d-pad a:hover.up {
  top: -5px;
}

.d-pad a:hover.right {
  right: -5px;
}

.d-pad a:hover.down {
  bottom: -5px;
}

.d-pad a:hover.left {
  left: -5px;
}

.center-circle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 60px;
  height: 60px;
  background-color: #1c1c1e;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}
</style>
