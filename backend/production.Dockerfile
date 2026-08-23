FROM python:3.10.21

WORKDIR /app

COPY ./ ./

RUN pip install -r requirements.txt

CMD ["fastapi", "run", "--workers", "4", "--host", "0.0.0.0"]

EXPOSE 8000