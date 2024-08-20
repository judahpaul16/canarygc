<div class="dpad-container relative flex items-center justify-center w-48 h-48">
  <nav class="d-pad relative">
    <button class="up"><i class="fas fa-chevron-up"></i></button>
    <button class="right"><i class="fas fa-chevron-right"></i></button>
    <button class="down"><i class="fas fa-chevron-down"></i></button>
    <button class="left"><i class="fas fa-chevron-left"></i></button>
    <div class="center-circle">
      <span class="move-text">Move</span>
    </div>
  </nav>
</div>

<style>
  .dpad-container {
    width: fit-content;
    margin: auto;
  }

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

  .d-pad button {
    position: absolute;
    display: flex;
    justify-content: center;
    align-items: center;
    color: #cacac9;
    font-size: 24px;
    transition: all 0.2s ease;
  }

  .d-pad button i {
    transform: rotate(-45deg);
  }

  .d-pad button.up {
    top: 0;
    left: 50%;
    transform: translateX(-50%) rotate(45deg);
  }

  .d-pad button.right {
    top: 50%;
    right: 0;
    transform: translateY(-50%) rotate(45deg);
  }

  .d-pad button.down {
    bottom: 0;
    left: 50%;
    transform: translateX(-50%) rotate(45deg);
  }

  .d-pad button.left {
    top: 50%;
    left: 0;
    transform: translateY(-50%) rotate(45deg);
  }

  .d-pad button:hover.up {
    top: -5px;
  }

  .d-pad button:hover.right {
    right: -5px;
  }

  .d-pad button:hover.down {
    bottom: -5px;
  }

  .d-pad button:hover.left {
    left: -5px;
  }

  .d-pad button:hover {
    color: #66e1ff;
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
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .move-text {
    color: #ffffff;
    font-size: calc(0.5rem + 0.5vw);
  }
  
  /* Mobile Styles */
  @media (max-width: 990px) {
    .dpad-container {
      width: auto;
    }

    .d-pad {
      width: 150px;
      height: 150px;
    }

    .d-pad button {
      font-size: 20px;
    }

    .center-circle {
      width: 50px;
      height: 50px;
    }

    .move-text {
      font-size: 1rem;
    }
  }
</style>
