@echo off
setlocal

:: تحديد المسار الكامل لـ Java 17
set "JAVA_HOME=C:\Program Files\Java\jdk-17.0.11"

:: استخدام المسار الكامل لـ java.exe
"%JAVA_HOME%\bin\java" -version

:: إعادة ترجمة DeviceFingerprint لتتوافق مع إصدار Java 8
"%JAVA_HOME%\bin\javac" -source 8 -target 8 src\activation\DeviceFingerprint.java

:: استخدام إلكترون المثبت محليًا
call npx electron .