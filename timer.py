import time
import os

minutes=int(input("Timer for how many minutes? "))
time.sleep(minutes * 60)
print("Time is up!")
print("\a")
os.system('notify-send "Study Timer" "Time is up!" ')
