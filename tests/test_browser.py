import os
import socket
import subprocess
import sys
import time
from urllib.request import urlopen

import pytest
from playwright.sync_api import expect, sync_playwright

from app.store import Store

PASSWORD = "integration-test-only"
pytestmark = pytest.mark.skipif(not os.getenv("VISIONWEAR_BROWSER_TEST"), reason="Set VISIONWEAR_BROWSER_TEST=1 to run browser tests.")


@pytest.fixture(scope="module")
def site(tmp_path_factory):
    path = tmp_path_factory.mktemp("browser") / "test.sqlite"
    database = Store(path)
    database.add_account("helper@example.test", "helper", "Demo Helper", PASSWORD)
    database.add_account("vest@example.test", "vest", "VW-001", PASSWORD)
    database.db.close()
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    url = f"http://127.0.0.1:{port}"
    env = {**os.environ, "VISIONWEAR_DB": str(path)}
    with subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(port)],
                          env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) as server:
        try:
            for _ in range(80):
                try:
                    with urlopen(f"{url}/health", timeout=1) as response:
                        assert response.status == 200
                    break
                except OSError:
                    time.sleep(0.1)
            else:
                pytest.fail("The test web server did not start")
            yield url
        finally:
            server.terminate()


def sign_in(browser, url, name):
    context = browser.new_context(permissions=["camera", "microphone"], viewport={"width": 1366, "height": 880})
    page = context.new_page()
    page.goto(url)
    page.get_by_label("Email").fill(f"{name}@example.test")
    page.get_by_label("Password").fill(PASSWORD)
    page.get_by_role("button", name="Sign in").click()
    return page


def test_call_lifecycle(site):
    with sync_playwright() as playwright:
        chrome = os.getenv("VISIONWEAR_CHROME")
        browser = playwright.chromium.launch(executable_path=chrome, args=[
            "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
            "--autoplay-policy=no-user-gesture-required",
        ])
        helper = sign_in(browser, site, "helper")
        vest = sign_in(browser, site, "vest")
        errors = []
        for page in (helper, vest):
            page.on("pageerror", lambda error: errors.append(str(error)))
        expect(helper.get_by_text("No requests while unavailable.")).to_be_visible()
        helper.get_by_role("button", name="Set available").click()
        expect(helper.get_by_text("Waiting for help requests.")).to_be_visible()
        vest.get_by_label("Distance in cm").fill("75")
        vest.get_by_role("button", name="Send sample").click()
        expect(vest.get_by_text("Front: CAUTION")).to_be_visible()
        expect(vest.get_by_text("Front: UNKNOWN")).to_be_visible(timeout=5000)

        def start(scenario):
            vest.get_by_label("Call scenario").select_option(scenario)
            vest.get_by_role("button", name="Press help button").click()
            helper.get_by_role("button", name="Accept request from VW-001").click()

        def dashboard(page):
            page.get_by_role("button", name="Return to dashboard").click()

        start("normal")
        expect(helper.locator(".live")).to_be_visible(timeout=11000)
        helper.wait_for_function("document.querySelector('video')?.videoWidth > 0")
        expect(helper.get_by_text("In session", exact=True)).to_be_visible()
        helper.get_by_role("button", name="Mute microphone", exact=True).click()
        expect(helper.get_by_role("button", name="Unmute microphone")).to_have_attribute("aria-pressed", "true")
        helper.get_by_role("button", name="Unmute microphone").click()
        if os.getenv("VISIONWEAR_TEST_SCREENSHOT"):
            helper.screenshot(path=os.environ["VISIONWEAR_TEST_SCREENSHOT"])
        helper.get_by_role("button", name="End session").click()
        expect(vest.get_by_role("heading", name="Session ended")).to_be_visible()
        expect(helper.get_by_role("heading", name="Session ended")).to_be_visible()
        assert helper.locator("audio").evaluate("(element) => element.srcObject === null")
        dashboard(helper)
        dashboard(vest)

        start("missing-video")
        expect(helper.get_by_role("heading", name="Video unavailable")).to_be_visible(timeout=12500)
        expect(helper.get_by_text("Two-way audio is still active.")).to_be_visible()
        vest.get_by_role("button", name="Simulate disconnect").click()
        expect(helper.get_by_role("heading", name="User disconnected")).to_be_visible(timeout=7000)
        dashboard(helper)
        dashboard(vest)

        start("missing-audio")
        expect(helper.get_by_role("heading", name="Connection failed")).to_be_visible(timeout=12500)
        dashboard(helper)
        dashboard(vest)
        vest.get_by_role("button", name="Press help button").click()
        expect(helper.get_by_role("button", name="Accept request from VW-001")).to_be_visible()
        vest.get_by_role("button", name="Cancel request").click()
        expect(vest.get_by_role("heading", name="Request cancelled")).to_be_visible()
        expect(helper.get_by_role("button", name="Accept request from VW-001")).to_have_count(0)
        assert not errors, errors
